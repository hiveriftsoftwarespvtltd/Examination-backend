import { AttemptService } from './attempt.service';

describe('AntiLeakage Verification - Zero Answer Key Exposure', () => {
  let attemptService: AttemptService;

  beforeEach(() => {
    const mockExamModel: any = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'exam_1',
          title: 'Full Stack Exam',
          difficulty: 'Intermediate',
          instructions: 'Read carefully',
        }),
      }),
    };

    const mockCandidateModel: any = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'cand_1',
          name: 'Candidate User',
          email: 'candidate@test.com',
          jobPosition: 'Node.js Engineer',
        }),
      }),
    };

    attemptService = new AttemptService(
      null as any,
      mockExamModel,
      mockCandidateModel,
      null as any,
      null as any,
    );
  });

  function recursivelyCheckKeys(obj: any, forbiddenRegex: RegExp) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      expect(forbiddenRegex.test(key)).toBe(false);
      recursivelyCheckKeys(obj[key], forbiddenRegex);
    }
  }

  it('should never expose correctOptionId, explanation, or privateAnswerKey in candidate state responses', async () => {
    const rawAttemptDocument: any = {
      _id: 'attempt_123',
      candidateId: 'cand_1',
      examId: 'exam_1',
      status: 'IN_PROGRESS',
      attemptNumber: 1,
      startedAt: new Date(),
      deadline: new Date(Date.now() + 600000),
      examSnapshot: {
        durationMinutes: 10,
        questionCount: 2,
        passingPercentage: 50,
        marksPerQuestion: 1,
        negativeMarking: false,
        negativeMarksPerQuestion: 0,
      },
      assignedQuestions: [
        {
          questionId: 'q_1',
          questionText: 'What is Node.js?',
          topic: 'Backend',
          marks: 1,
          options: [
            { optionId: 'opt_1', text: 'JavaScript runtime' },
            { optionId: 'opt_2', text: 'A database' },
          ],
        },
      ],
      privateAnswerKey: [
        { questionId: 'q_1', correctOptionId: 'opt_1', marks: 1 },
      ],
      savedResponses: [
        { questionId: 'q_1', selectedOptionId: 'opt_1', revision: 1, updatedAt: new Date() },
      ],
    };

    const response = await (attemptService as any).formatSanitizedAttemptResponse(rawAttemptDocument);

    // Recursively check all keys in response for sensitive words
    const sensitivePattern = /^(correctOptionId|correctOption|answerKey|isCorrect|explanation|solution)$/i;
    recursivelyCheckKeys(response, sensitivePattern);

    // Explicit checks
    expect(response.privateAnswerKey).toBeUndefined();
    expect(response.questions[0].correctOptionId).toBeUndefined();
    expect(response.questions[0].explanation).toBeUndefined();
  });
});

