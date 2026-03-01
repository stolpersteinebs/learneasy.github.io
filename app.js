const state = {
  mode: "explain",
  currentQuestion: null,
};

const els = {
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  subject: document.getElementById("subject"),
  topic: document.getElementById("topic"),
  level: document.getElementById("level"),
  useWebContext: document.getElementById("useWebContext"),
  explainModeBtn: document.getElementById("explainModeBtn"),
  quizModeBtn: document.getElementById("quizModeBtn"),
  explainPanel: document.getElementById("explainPanel"),
  quizPanel: document.getElementById("quizPanel"),
  explainPrompt: document.getElementById("explainPrompt"),
  runExplain: document.getElementById("runExplain"),
  questionType: document.getElementById("questionType"),
  difficulty: document.getElementById("difficulty"),
  generateQuestion: document.getElementById("generateQuestion"),
  questionBox: document.getElementById("questionBox"),
  taskText: document.getElementById("taskText"),
  userAnswer: document.getElementById("userAnswer"),
  submitAnswer: document.getElementById("submitAnswer"),
  output: document.getElementById("output"),
};

function setOutput(value) {
  els.output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function switchMode(mode) {
  state.mode = mode;
  const explain = mode === "explain";
  els.explainPanel.classList.toggle("active", explain);
  els.quizPanel.classList.toggle("active", !explain);
  els.explainModeBtn.classList.toggle("active", explain);
  els.quizModeBtn.classList.toggle("active", !explain);
}

async function fetchWikipediaContext(topic) {
  const url = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wikipedia-Kontext nicht verfügbar");
  const data = await res.json();
  return data.extract || "";
}

async function deepSeekChat({ apiKey, model, messages, responseFormat }) {
  const body = {
    model,
    messages,
    temperature: 0.3,
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DeepSeek Fehler ${res.status}: ${txt}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

function getConfig() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) throw new Error("Bitte DeepSeek API-Key eintragen.");
  return {
    apiKey,
    model: els.model.value.trim() || "deepseek-chat",
    subject: els.subject.value.trim(),
    topic: els.topic.value.trim(),
    level: els.level.value.trim(),
    useWebContext: els.useWebContext.checked,
  };
}

async function runExplain() {
  const cfg = getConfig();
  setOutput("Erklärung wird erzeugt...");
  let webContext = "";
  if (cfg.useWebContext) {
    try {
      webContext = await fetchWikipediaContext(cfg.topic);
    } catch {
      webContext = "";
    }
  }

  const messages = [
    {
      role: "system",
      content:
        "Du bist ein didaktischer Tutor für Schüler und Studierende. Erkläre klar, korrekt, mit Beispiel und typischen Fehlern.",
    },
    {
      role: "user",
      content: `Fach: ${cfg.subject}\nThema: ${cfg.topic}\nNiveau: ${cfg.level}\nNutzerfrage: ${els.explainPrompt.value.trim()}\nWeb-Kontext (optional): ${webContext}`,
    },
  ];

  const answer = await deepSeekChat({ apiKey: cfg.apiKey, model: cfg.model, messages });
  setOutput(answer);
}

async function generateQuestion() {
  const cfg = getConfig();
  setOutput("Aufgabe wird erzeugt...");

  const schema = {
    type: "object",
    properties: {
      question_type: { type: "string" },
      task: { type: "string" },
      expected_answer: { type: ["string", "null"] },
      accepted_variants: { type: "array", items: { type: "string" } },
      scoring_rubric: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            points: { type: "number" },
          },
          required: ["criterion", "points"],
        },
      },
      max_points: { type: "number" },
      hints: { type: "array", items: { type: "string" } },
      solution_steps: { type: "array", items: { type: "string" } },
      solution_type: { type: "string", enum: ["objective", "open"] },
    },
    required: [
      "question_type",
      "task",
      "expected_answer",
      "accepted_variants",
      "scoring_rubric",
      "max_points",
      "hints",
      "solution_steps",
      "solution_type",
    ],
  };

  const messages = [
    {
      role: "system",
      content:
        "Du bist ein Aufgaben-Generator. Antworte ausschließlich als JSON. Für essay-Aufgaben muss expected_answer null sein und solution_type='open'.",
    },
    {
      role: "user",
      content: `Erzeuge genau 1 Aufgabe. Fach: ${cfg.subject}, Thema: ${cfg.topic}, Niveau: ${cfg.level}, Schwierigkeit: ${els.difficulty.value}, Aufgabentyp: ${els.questionType.value}.`,
    },
  ];

  const raw = await deepSeekChat({
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages,
    responseFormat: { type: "json_schema", json_schema: { name: "question", schema } },
  });

  const question = JSON.parse(raw);
  state.currentQuestion = question;
  els.taskText.textContent = question.task;
  els.questionBox.classList.remove("hidden");
  setOutput(question);
}

function normalizeAnswer(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

async function evaluateAnswer() {
  if (!state.currentQuestion) throw new Error("Bitte zuerst eine Aufgabe erzeugen.");
  const cfg = getConfig();
  const q = state.currentQuestion;
  const userAnswer = els.userAnswer.value.trim();
  if (!userAnswer) throw new Error("Bitte eine Antwort eingeben.");

  if (q.solution_type === "objective" && q.expected_answer) {
    const normUser = normalizeAnswer(userAnswer);
    const variants = [q.expected_answer, ...(q.accepted_variants || [])].map(normalizeAnswer);

    if (variants.includes(normUser)) {
      setOutput({
        result: "correct",
        score: q.max_points,
        feedback: "Richtig gelöst.",
      });
      return;
    }

    setOutput("Antwort weicht ab – prüfe inhaltliche Gleichwertigkeit via DeepSeek...");
    const judgeMessages = [
      {
        role: "system",
        content:
          "Du bist ein strenger inhaltlicher Prüfer. Bewerte ausschließlich inhaltliche Korrektheit, ignoriere Stil. Antworte nur JSON.",
      },
      {
        role: "user",
        content: `Aufgabe: ${q.task}\nReferenzlösung: ${q.expected_answer}\nNutzerantwort: ${userAnswer}\nEntscheide, ob die Antwort inhaltlich korrekt ist, aber anders formuliert.`,
      },
    ];

    const judgeRaw = await deepSeekChat({
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: judgeMessages,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "judge",
          schema: {
            type: "object",
            properties: {
              equivalent: { type: "boolean" },
              feedback: { type: "string" },
            },
            required: ["equivalent", "feedback"],
          },
        },
      },
    });
    const judge = JSON.parse(judgeRaw);
    setOutput({
      result: judge.equivalent ? "correct_equivalent" : "incorrect",
      score: judge.equivalent ? q.max_points : 0,
      feedback: judge.feedback,
    });
    return;
  }

  setOutput("Offene Antwort – rubric-basiertes Feedback wird erzeugt...");
  const feedbackMessages = [
    {
      role: "system",
      content:
        "Du bist ein fairer Coach für offene Antworten. Bewerte ausschließlich anhand der Rubrik. Gib Punkte, Stärken, Verbesserungen und nächste Schritte als JSON.",
    },
    {
      role: "user",
      content: `Aufgabe: ${q.task}\nRubrik: ${JSON.stringify(q.scoring_rubric)}\nMax Punkte: ${q.max_points}\nNutzerantwort: ${userAnswer}`,
    },
  ];

  const feedbackRaw = await deepSeekChat({
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages: feedbackMessages,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "feedback",
        schema: {
          type: "object",
          properties: {
            score: { type: "number" },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            next_step: { type: "string" },
          },
          required: ["score", "strengths", "improvements", "next_step"],
        },
      },
    },
  });

  setOutput(JSON.parse(feedbackRaw));
}

els.explainModeBtn.addEventListener("click", () => switchMode("explain"));
els.quizModeBtn.addEventListener("click", () => switchMode("quiz"));
els.runExplain.addEventListener("click", () => runExplain().catch((e) => setOutput(e.message)));
els.generateQuestion.addEventListener("click", () => generateQuestion().catch((e) => setOutput(e.message)));
els.submitAnswer.addEventListener("click", () => evaluateAnswer().catch((e) => setOutput(e.message)));

switchMode("explain");
