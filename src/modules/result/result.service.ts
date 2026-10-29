import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as xlsx from 'xlsx';
import { Result, ResultDocument } from '../../database/schemas/result.schema';
import { Exam, ExamDocument } from '../../database/schemas/exam.schema';
import { Candidate, CandidateDocument } from '../../database/schemas/candidate.schema';
import { ExamAttempt, AttemptDocument } from '../../database/schemas/attempt.schema';
import { Question, QuestionDocument } from '../../database/schemas/question.schema';
import { sanitizeCsvField } from '../../common/utils/sanitizer.util';

@Injectable()
export class ResultService {
  constructor(
    @InjectModel(Result.name) private resultModel: Model<ResultDocument>,
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectModel(Candidate.name) private candidateModel: Model<CandidateDocument>,
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    examId?: string;
    isPassed?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.examId) filter.examId = query.examId;
    if (query.isPassed !== undefined && query.isPassed !== '') {
      filter.isPassed = query.isPassed === 'true';
    }

    if (query.search) {
      const candidates = await this.candidateModel
        .find({
          $or: [
            { name: { $regex: query.search, $options: 'i' } },
            { email: { $regex: query.search, $options: 'i' } },
            { jobPosition: { $regex: query.search, $options: 'i' } },
          ],
        })
        .select('_id');
      const candidateIds = candidates.map((c) => c._id);
      filter.candidateId = { $in: candidateIds };
    }

    const [results, total] = await Promise.all([
      this.resultModel
        .find(filter)
        .populate('candidateId', 'name email phone jobPosition')
        .populate('examId', 'title difficulty durationMinutes questionCount')
        .populate('attemptId', 'attemptNumber startedAt submittedAt timeTakenSeconds')
        .sort({ calculatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.resultModel.countDocuments(filter),
    ]);

    return {
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const result = await this.resultModel
      .findById(id)
      .populate('candidateId', 'name email phone jobPosition')
      .populate('examId', 'title difficulty durationMinutes questionCount instructions')
      .populate('attemptId')
      .lean();

    if (!result) {
      throw new NotFoundException('Result not found');
    }
    return result;
  }

  async deleteResult(id: string) {
    const result = await this.resultModel.findById(id);
    if (!result) {
      throw new NotFoundException('Result not found');
    }
    if (result.attemptId) {
      await this.attemptModel.findByIdAndDelete(result.attemptId);
    }
    await this.resultModel.findByIdAndDelete(id);
    return { success: true, message: 'Result and associated attempt deleted successfully' };
  }

  async getDashboardStats() {
    const [
      totalExams,
      totalQuestions,
      totalCandidates,
      totalResults,
      passedResults,
      recentResults,
      activeExams,
      difficultyDist,
      topicDist,
    ] = await Promise.all([
      this.examModel.countDocuments({ isActive: true }),
      this.questionModel.countDocuments({ isActive: true, isApproved: true }),
      this.candidateModel.countDocuments(),
      this.resultModel.countDocuments(),
      this.resultModel.countDocuments({ isPassed: true }),
      this.resultModel
        .find()
        .populate('candidateId', 'name email phone jobPosition')
        .populate('examId', 'title difficulty')
        .populate('attemptId', 'timeTakenSeconds submittedAt')
        .sort({ calculatedAt: -1 })
        .limit(6)
        .lean(),
      this.examModel.find({ isActive: true }).sort({ createdAt: -1 }).limit(4).lean(),
      this.questionModel.aggregate([
        { $match: { isActive: true, isApproved: true } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),
      this.questionModel.aggregate([
        { $match: { isActive: true, isApproved: true } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    let passRate = 0;
    if (totalResults > 0) {
      passRate = Number(((passedResults / totalResults) * 100).toFixed(1));
    }

    const failedResults = totalResults - passedResults;

    const avgScoreAgg = await this.resultModel.aggregate([
      { $group: { _id: null, avgPercentage: { $avg: '$percentage' } } },
    ]);
    const averageScore = avgScoreAgg.length > 0 ? Number(avgScoreAgg[0].avgPercentage.toFixed(1)) : 0;

    return {
      totalExams,
      totalQuestions,
      totalCandidates,
      totalResults,
      passedResults,
      failedResults,
      passRate,
      averageScore,
      recentResults,
      activeExams,
      difficultyDistribution: difficultyDist.map((d) => ({ difficulty: d._id, count: d.count })),
      topicDistribution: topicDist.map((t) => ({ topic: t._id, count: t.count })),
    };
  }

  async exportResults(format: 'csv' | 'xlsx', query: any) {
    const filter: any = {};
    if (query.examId) filter.examId = query.examId;
    if (query.isPassed !== undefined && query.isPassed !== '') {
      filter.isPassed = query.isPassed === 'true';
    }

    const results = await this.resultModel
      .find(filter)
      .populate('candidateId', 'name email phone jobPosition')
      .populate('examId', 'title difficulty')
      .populate('attemptId', 'attemptNumber startedAt submittedAt timeTakenSeconds')
      .sort({ calculatedAt: -1 })
      .lean();

    const dataRows = results.map((r: any) => ({
      CandidateName: r.candidateId?.name || '',
      Email: r.candidateId?.email || '',
      Phone: r.candidateId?.phone || '',
      JobPosition: r.candidateId?.jobPosition || '',
      ExamTitle: r.examId?.title || '',
      Difficulty: r.examId?.difficulty || '',
      AttemptNumber: r.attemptId?.attemptNumber || 1,
      TotalQuestions: r.totalQuestions,
      CorrectAnswers: r.correctAnswers,
      IncorrectAnswers: r.incorrectAnswers,
      Unanswered: r.unansweredQuestions,
      TotalMarksPossible: r.totalPossibleMarks,
      MarksObtained: r.marksObtained,
      Percentage: r.percentage,
      PassingThreshold: r.passingPercentage,
      Status: r.isPassed ? 'PASSED' : 'FAILED',
      TimeTakenSeconds: r.attemptId?.timeTakenSeconds || 0,
      SubmissionDate: r.calculatedAt ? new Date(r.calculatedAt).toISOString() : '',
    }));

    if (format === 'csv') {
      const headers = [
        'CandidateName',
        'Email',
        'Phone',
        'JobPosition',
        'ExamTitle',
        'Difficulty',
        'AttemptNumber',
        'TotalQuestions',
        'CorrectAnswers',
        'IncorrectAnswers',
        'Unanswered',
        'TotalMarksPossible',
        'MarksObtained',
        'Percentage',
        'PassingThreshold',
        'Status',
        'TimeTakenSeconds',
        'SubmissionDate',
      ];

      const csvLines = [headers.join(',')];
      for (const row of dataRows) {
        const line = headers.map((h) => sanitizeCsvField(row[h])).join(',');
        csvLines.push(line);
      }

      return {
        buffer: Buffer.from(csvLines.join('\n'), 'utf-8'),
        contentType: 'text/csv',
        filename: `examination_results_${Date.now()}.csv`,
      };
    } else {
      const worksheet = xlsx.utils.json_to_sheet(dataRows);
      for (const cellAddress in worksheet) {
        if (cellAddress[0] === '!') continue;
        const cell = worksheet[cellAddress];
        if (typeof cell.v === 'string') {
          cell.t = 's';
          delete cell.f;
        } else if (typeof cell.v === 'number') {
          cell.t = 'n';
        }
      }

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Exam Results');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `examination_results_${Date.now()}.xlsx`,
      };
    }
  }
}

