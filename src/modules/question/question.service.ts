import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as xlsx from 'xlsx';
import { Question, QuestionDocument } from '../../database/schemas/question.schema';
import { DifficultyLevel } from '../../database/schemas/exam.schema';
import { CreateQuestionDto } from './dto/create-question.dto';
import { sanitizeCsvField, sanitizeTextForSpreadsheet } from '../../common/utils/sanitizer.util';

@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  async create(dto: CreateQuestionDto, adminId?: string): Promise<Question> {
    const validOptionIds = dto.options.map((o) => o.optionId);
    if (!validOptionIds.includes(dto.correctOptionId)) {
      throw new BadRequestException('correctOptionId must match one of the 4 option IDs');
    }

    return this.questionModel.create({
      ...dto,
      createdBy: adminId ? new Types.ObjectId(adminId) : undefined,
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    topic?: string;
    difficulty?: string;
    isApproved?: string;
    isActive?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.topic) filter.topic = query.topic;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.isApproved !== undefined && query.isApproved !== '') {
      filter.isApproved = query.isApproved === 'true';
    }
    if (query.isActive !== undefined && query.isActive !== '') {
      filter.isActive = query.isActive === 'true';
    }
    if (query.search) {
      filter.$or = [
        { questionText: { $regex: query.search, $options: 'i' } },
        { topic: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [questions, total] = await Promise.all([
      this.questionModel
        .find(filter)
        .select('+correctOptionId +explanation') // Admin is authorized to see answer key
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.questionModel.countDocuments(filter),
    ]);

    return {
      questions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Question> {
    const question = await this.questionModel
      .findById(id)
      .select('+correctOptionId +explanation');
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  async update(id: string, dto: Partial<CreateQuestionDto>): Promise<Question> {
    if (dto.options && dto.correctOptionId) {
      const validOptionIds = dto.options.map((o) => o.optionId);
      if (!validOptionIds.includes(dto.correctOptionId)) {
        throw new BadRequestException('correctOptionId must match one of the 4 option IDs');
      }
    }

    const updated = await this.questionModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .select('+correctOptionId +explanation');
    if (!updated) {
      throw new NotFoundException('Question not found');
    }
    return updated;
  }

  async toggleApproval(id: string, adminId: string, approve: boolean) {
    const question = await this.questionModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isApproved: approve,
          approvedBy: approve ? new Types.ObjectId(adminId) : null,
        },
      },
      { new: true },
    );
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  async remove(id: string) {
    const question = await this.questionModel.findByIdAndDelete(id);
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return { message: 'Question deleted successfully' };
  }

  async importQuestions(buffer: Buffer, originalname: string, dryRun: boolean, adminId: string) {
    let rows: any[] = [];
    const isCsv = originalname.endsWith('.csv');
    const isXlsx = originalname.endsWith('.xlsx') || originalname.endsWith('.xls');

    if (!isCsv && !isXlsx) {
      throw new BadRequestException('Unsupported file format. Please upload CSV or XLSX.');
    }

    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    } catch (err) {
      throw new BadRequestException(`Failed to parse spreadsheet: ${err.message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Spreadsheet is empty or has no data rows');
    }

    if (rows.length > 1000) {
      throw new BadRequestException('Spreadsheet exceeds maximum permitted row count of 1,000');
    }

    const validRows: any[] = [];
    const invalidRows: { rowNumber: number; reason: string; raw: any }[] = [];
    const existingTexts = new Set(
      (await this.questionModel.find({}, { questionText: 1 }).lean()).map((q) =>
        q.questionText.trim().toLowerCase(),
      ),
    );

    const validDifficulties = Object.values(DifficultyLevel);

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Row 1 is header
      const questionText = String(row['QuestionText'] || row['questionText'] || row['Question'] || '').trim();
      const optA = String(row['OptionA'] || row['optionA'] || row['Option 1'] || '').trim();
      const optB = String(row['OptionB'] || row['optionB'] || row['Option 2'] || '').trim();
      const optC = String(row['OptionC'] || row['optionC'] || row['Option 3'] || '').trim();
      const optD = String(row['OptionD'] || row['optionD'] || row['Option 4'] || '').trim();
      const correctOptionRaw = String(row['CorrectOption'] || row['correctOption'] || row['Answer'] || '').trim().toUpperCase();
      const topic = String(row['Topic'] || row['topic'] || 'General').trim();
      let difficulty = String(row['Difficulty'] || row['difficulty'] || 'Intermediate').trim();
      const marks = Number(row['Marks'] || row['marks'] || 1);
      const explanation = String(row['Explanation'] || row['explanation'] || '').trim();

      if (!questionText) {
        invalidRows.push({ rowNumber: rowNum, reason: 'Missing question text', raw: row });
        return;
      }

      if (!optA || !optB || !optC || !optD) {
        invalidRows.push({ rowNumber: rowNum, reason: 'All 4 options (A, B, C, D) are required', raw: row });
        return;
      }

      let correctOptionId = '';
      if (correctOptionRaw === 'A' || correctOptionRaw === 'OPT_1' || correctOptionRaw === optA.toUpperCase()) {
        correctOptionId = 'opt_1';
      } else if (correctOptionRaw === 'B' || correctOptionRaw === 'OPT_2' || correctOptionRaw === optB.toUpperCase()) {
        correctOptionId = 'opt_2';
      } else if (correctOptionRaw === 'C' || correctOptionRaw === 'OPT_3' || correctOptionRaw === optC.toUpperCase()) {
        correctOptionId = 'opt_3';
      } else if (correctOptionRaw === 'D' || correctOptionRaw === 'OPT_4' || correctOptionRaw === optD.toUpperCase()) {
        correctOptionId = 'opt_4';
      } else {
        invalidRows.push({
          rowNumber: rowNum,
          reason: `Invalid correct option identifier "${correctOptionRaw}". Must be A, B, C, or D`,
          raw: row,
        });
        return;
      }

      // Normalize difficulty
      const matchedDiff = validDifficulties.find((d) => d.toLowerCase() === difficulty.toLowerCase());
      if (matchedDiff) {
        difficulty = matchedDiff;
      } else {
        difficulty = DifficultyLevel.INTERMEDIATE;
      }

      const normalizedText = questionText.toLowerCase();
      if (existingTexts.has(normalizedText)) {
        invalidRows.push({ rowNumber: rowNum, reason: 'Duplicate question text already exists in bank', raw: row });
        return;
      }
      existingTexts.add(normalizedText);

      validRows.push({
        questionText: sanitizeTextForSpreadsheet(questionText),
        options: [
          { optionId: 'opt_1', text: sanitizeTextForSpreadsheet(optA) },
          { optionId: 'opt_2', text: sanitizeTextForSpreadsheet(optB) },
          { optionId: 'opt_3', text: sanitizeTextForSpreadsheet(optC) },
          { optionId: 'opt_4', text: sanitizeTextForSpreadsheet(optD) },
        ],
        correctOptionId,
        topic: sanitizeTextForSpreadsheet(topic),
        difficulty: difficulty as DifficultyLevel,
        marks: isNaN(marks) || marks <= 0 ? 1 : marks,
        explanation: sanitizeTextForSpreadsheet(explanation),
        isApproved: false, // Imported questions require manual approval unless specified
        isActive: true,
        createdBy: new Types.ObjectId(adminId),
      });
    });

    if (!dryRun && validRows.length > 0) {
      await this.questionModel.insertMany(validRows);
      this.logger.log(`Admin ${adminId} imported ${validRows.length} questions into Question Bank`);
    }

    return {
      dryRun,
      totalRows: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      preview: validRows.slice(0, 5),
      errors: invalidRows.slice(0, 50),
    };
  }

  async exportQuestions(format: 'csv' | 'xlsx') {
    const questions = await this.questionModel
      .find({})
      .select('+correctOptionId +explanation')
      .sort({ topic: 1, difficulty: 1 })
      .lean();

    const dataRows = questions.map((q) => {
      const optA = q.options.find((o) => o.optionId === 'opt_1')?.text || '';
      const optB = q.options.find((o) => o.optionId === 'opt_2')?.text || '';
      const optC = q.options.find((o) => o.optionId === 'opt_3')?.text || '';
      const optD = q.options.find((o) => o.optionId === 'opt_4')?.text || '';
      const answerLetter =
        q.correctOptionId === 'opt_1' ? 'A' : q.correctOptionId === 'opt_2' ? 'B' : q.correctOptionId === 'opt_3' ? 'C' : 'D';

      return {
        QuestionText: q.questionText,
        OptionA: optA,
        OptionB: optB,
        OptionC: optC,
        OptionD: optD,
        CorrectOption: answerLetter,
        Topic: q.topic,
        Difficulty: q.difficulty,
        Marks: q.marks,
        Approved: q.isApproved ? 'YES' : 'NO',
        Active: q.isActive ? 'YES' : 'NO',
        Explanation: q.explanation || '',
      };
    });

    if (format === 'csv') {
      const headers = ['QuestionText', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'CorrectOption', 'Topic', 'Difficulty', 'Marks', 'Approved', 'Active', 'Explanation'];
      const csvLines = [headers.join(',')];

      for (const row of dataRows) {
        const line = headers.map((h) => sanitizeCsvField(row[h])).join(',');
        csvLines.push(line);
      }

      return {
        buffer: Buffer.from(csvLines.join('\n'), 'utf-8'),
        contentType: 'text/csv',
        filename: `question_bank_${Date.now()}.csv`,
      };
    } else {
      // XLSX generation with explicit string / number types
      const worksheet = xlsx.utils.json_to_sheet(dataRows);

      // Protect against formula evaluation in cells
      for (const cellAddress in worksheet) {
        if (cellAddress[0] === '!') continue;
        const cell = worksheet[cellAddress];
        if (typeof cell.v === 'string') {
          cell.t = 's'; // Force type string
          delete cell.f; // Ensure no formula property
        } else if (typeof cell.v === 'number') {
          cell.t = 'n'; // Numeric type
        }
      }

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Question Bank');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `question_bank_${Date.now()}.xlsx`,
      };
    }
  }
}

