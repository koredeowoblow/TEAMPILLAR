describe("PracticeService deterministic selection and scoring", () => {
  let PracticeService;
  let questionRepository;

  beforeAll(async () => {
    PracticeService = (await import("../src/services/PracticeService.js"))
      .default;
    questionRepository = (
      await import("../src/repository/QuestionRepository.js")
    ).questionRepository;
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

    const origFind = questionRepository.find;
    questionRepository.find = jest.fn().mockResolvedValue(sample);

    const a = await PracticeService.getQuestionsForSubject("subj", {
      limit: 3,
      deterministic: true,
    });
    const b = await PracticeService.getQuestionsForSubject("subj", {
      limit: 3,
      deterministic: true,
    });

    expect(a.map((q) => q._id)).toEqual(b.map((q) => q._id));

    questionRepository.find = origFind;
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
});
