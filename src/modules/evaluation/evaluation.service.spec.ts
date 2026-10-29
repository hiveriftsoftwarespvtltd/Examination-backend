import { EvaluationService } from './evaluation.service';

describe('EvaluationService - Scoring Engine', () => {
  let service: EvaluationService;

  beforeEach(() => {
    // Instantiate service with dummy dependencies to test calculateEvaluation pure logic
    service = new EvaluationService(null as any, null as any, null as any, null as any, null as any);
  });

  it('should correctly score an exam with 100% correct answers', () => {
    const attempt: any = {
      examSnapshot: {
        marksPerQuestion: 1,
        negativeMarking: false,
        negativeMarksPerQuestion: 0,
        passingPercentage: 50,
      },
      assignedQuestions: [
        { questionId: 'q1' },
        { questionId: 'q2' },
        { questionId: 'q3' },
        { questionId: 'q4' },
      ],
      privateAnswerKey: [
        { questionId: 'q1', correctOptionId: 'opt_1' },
        { questionId: 'q2', correctOptionId: 'opt_2' },
        { questionId: 'q3', correctOptionId: 'opt_3' },
        { questionId: 'q4', correctOptionId: 'opt_4' },
      ],
      savedResponses: [
        { questionId: 'q1', selectedOptionId: 'opt_1' },
        { questionId: 'q2', selectedOptionId: 'opt_2' },
        { questionId: 'q3', selectedOptionId: 'opt_3' },
        { questionId: 'q4', selectedOptionId: 'opt_4' },
      ],
    };

    const result = service.calculateEvaluation(attempt);
    expect(result.totalQuestions).toBe(4);
    expect(result.correctAnswers).toBe(4);
    expect(result.incorrectAnswers).toBe(0);
    expect(result.unansweredQuestions).toBe(0);
    expect(result.totalPossibleMarks).toBe(4);
    expect(result.marksObtained).toBe(4);
    expect(result.percentage).toBe(100);
    expect(result.isPassed).toBe(true);
  });

  it('should handle negative marking and apply the zero-floor rule when penalties exceed marks', () => {
    const attempt: any = {
      examSnapshot: {
        marksPerQuestion: 1,
        negativeMarking: true,
        negativeMarksPerQuestion: 0.5,
        passingPercentage: 50,
      },
      assignedQuestions: [
        { questionId: 'q1' },
        { questionId: 'q2' },
        { questionId: 'q3' },
        { questionId: 'q4' },
      ],
      privateAnswerKey: [
        { questionId: 'q1', correctOptionId: 'opt_1' },
        { questionId: 'q2', correctOptionId: 'opt_2' },
        { questionId: 'q3', correctOptionId: 'opt_3' },
        { questionId: 'q4', correctOptionId: 'opt_4' },
      ],
      // 1 correct (+1.0), 3 incorrect (-1.5) => raw marks = -0.5 => floored to 0!
      savedResponses: [
        { questionId: 'q1', selectedOptionId: 'opt_1' },
        { questionId: 'q2', selectedOptionId: 'opt_wrong' },
        { questionId: 'q3', selectedOptionId: 'opt_wrong' },
        { questionId: 'q4', selectedOptionId: 'opt_wrong' },
      ],
    };

    const result = service.calculateEvaluation(attempt);
    expect(result.correctAnswers).toBe(1);
    expect(result.incorrectAnswers).toBe(3);
    expect(result.marksObtained).toBe(0); // Zero floor
    expect(result.percentage).toBe(0);
    expect(result.isPassed).toBe(false);
  });

  it('should not penalize unanswered questions with negative marking', () => {
    const attempt: any = {
      examSnapshot: {
        marksPerQuestion: 2,
        negativeMarking: true,
        negativeMarksPerQuestion: 0.5,
        passingPercentage: 50,
      },
      assignedQuestions: [
        { questionId: 'q1' },
        { questionId: 'q2' },
        { questionId: 'q3' },
        { questionId: 'q4' },
      ],
      privateAnswerKey: [
        { questionId: 'q1', correctOptionId: 'opt_1' },
        { questionId: 'q2', correctOptionId: 'opt_2' },
        { questionId: 'q3', correctOptionId: 'opt_3' },
        { questionId: 'q4', correctOptionId: 'opt_4' },
      ],
      // 1 correct (+2.0), 1 incorrect (-0.5), 2 unanswered (0) => marks = 1.5 / 8 = 18.75%
      savedResponses: [
        { questionId: 'q1', selectedOptionId: 'opt_1' },
        { questionId: 'q2', selectedOptionId: 'opt_wrong' },
        { questionId: 'q3', selectedOptionId: null },
        { questionId: 'q4', selectedOptionId: null },
      ],
    };

    const result = service.calculateEvaluation(attempt);
    expect(result.correctAnswers).toBe(1);
    expect(result.incorrectAnswers).toBe(1);
    expect(result.unansweredQuestions).toBe(2);
    expect(result.totalPossibleMarks).toBe(8);
    expect(result.marksObtained).toBe(1.5);
    expect(result.percentage).toBe(18.75);
    expect(result.isPassed).toBe(false);
  });
});

