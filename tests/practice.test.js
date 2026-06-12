describe("PracticeService deterministic selection and scoring", () => {
  let PracticeService;
  let questionRepository;
  let practiceRepository;

  beforeAll(async () => {
    PracticeService = (await import("../src/services/PracticeService.js"))
      .default;
    questionRepository = (
      await import("../src/repository/QuestionRepository.js")
    ).questionRepository;
    practiceRepository = (
      await import("../src/repository/PracticeRepository.js")
    ).practiceRepository;
  });

  test("deterministic question selection returns same order when deterministic flag set", async () => {
    const sample = [
      {
        _id: "1",
        options: [
          { id: "a", text: "A", isCorrect: true },
          { id: "b", text: "B" },
        ],
      },
      {
        _id: "2",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B", isCorrect: true },
        ],
      },
      {
        _id: "3",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
      },
    ];

    const origAggregate = questionRepository.aggregate;
    questionRepository.aggregate = jest.fn().mockResolvedValue(sample);

    const validSubjectId = "5f8d0a92d2b5880017a8e5f2";
    const a = await PracticeService.getQuestionsForSubject(validSubjectId, {
      limit: 3,
      deterministic: true,
    });
    const b = await PracticeService.getQuestionsForSubject(validSubjectId, {
      limit: 3,
      deterministic: true,
    });

    expect(a.map((q) => q._id)).toEqual(b.map((q) => q._id));

    questionRepository.aggregate = origAggregate;
  });

  test("UTME scoring selects english + top 3 subjects", () => {
    const scores = {
      English: 80,
      Maths: 90,
      Physics: 70,
      Chemistry: 60,
      Biology: 50,
    };
    const total = PracticeService.computeUTMEScoreFromMap(scores);
    expect(total).toBe(300);
  });

  test("standard session persistence retrieves saved questions and updates session on first query", async () => {
    const sample = [
      {
        _id: "5f8d0a92d2b5880017a8e5f2",
        options: [{ id: "a", text: "A", isCorrect: true }],
      },
      {
        _id: "5f8d0a92d2b5880017a8e5f3",
        options: [{ id: "a", text: "A", isCorrect: true }],
      },
    ];

    const mockSession = {
      _id: "5f8d0a92d2b5880017a8e5f4",
      sessionStatus: "ACTIVE",
      questionIds: [],
    };

    const origFindById = practiceRepository.findById;
    const origUpdate = practiceRepository.update;
    const origAggregate = questionRepository.aggregate;
    const origFind = questionRepository.find;

    // First call: session has no questionIds, so it queries aggregate, then updates session
    practiceRepository.findById = jest.fn().mockResolvedValue(mockSession);
    practiceRepository.update = jest.fn().mockImplementation((id, data) => {
      mockSession.questionIds = data.questionIds;
      return mockSession;
    });
    questionRepository.aggregate = jest.fn().mockResolvedValue(sample);

    const validSubjectId = "5f8d0a92d2b5880017a8e5f2";
    const questions1 = await PracticeService.getQuestionsForSubject(validSubjectId, {
      sessionId: "5f8d0a92d2b5880017a8e5f4",
      limit: 2,
    });

    expect(questions1.map((q) => String(q._id))).toEqual(["5f8d0a92d2b5880017a8e5f2", "5f8d0a92d2b5880017a8e5f3"]);
    expect(practiceRepository.update).toHaveBeenCalledWith("5f8d0a92d2b5880017a8e5f4", {
      questionIds: ["5f8d0a92d2b5880017a8e5f2", "5f8d0a92d2b5880017a8e5f3"],
    });

    // Second call: session has questionIds, so it should fetch using find() instead of aggregate
    questionRepository.find = jest.fn().mockResolvedValue(sample);
    questionRepository.aggregate.mockClear();

    const questions2 = await PracticeService.getQuestionsForSubject(validSubjectId, {
      sessionId: "5f8d0a92d2b5880017a8e5f4",
      limit: 2,
    });

    expect(questions2.map((q) => String(q._id))).toEqual(["5f8d0a92d2b5880017a8e5f2", "5f8d0a92d2b5880017a8e5f3"]);
    expect(questionRepository.aggregate).not.toHaveBeenCalled();
    expect(questionRepository.find).toHaveBeenCalledWith({
      _id: { $in: ["5f8d0a92d2b5880017a8e5f2", "5f8d0a92d2b5880017a8e5f3"] },
    }, {
      lean: true,
      select: "_id subjectId content metadata options.id options.text"
    });

    // Restore original methods
    practiceRepository.findById = origFindById;
    practiceRepository.update = origUpdate;
    questionRepository.aggregate = origAggregate;
    questionRepository.find = origFind;
  });

  test("topic selection passes correct match stage filters including metadata.topic", async () => {
    const origAggregate = questionRepository.aggregate;
    questionRepository.aggregate = jest.fn().mockResolvedValue([]);

    const validSubjectId = "5f8d0a92d2b5880017a8e5f2";
    await PracticeService.getQuestionsForSubject(validSubjectId, {
      limit: 5,
      topic: "Matrices",
      deterministic: true,
    });

    expect(questionRepository.aggregate).toHaveBeenCalled();
    const calls = questionRepository.aggregate.mock.calls;
    const matchStage = calls[0][0][0].$match;
    expect(matchStage["metadata.topic"]).toBe("Matrices");

    questionRepository.aggregate = origAggregate;
  });
});
