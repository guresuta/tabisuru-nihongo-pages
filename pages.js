const elements = {
  lessonList: document.querySelector("#lessonList"),
  lessonSelect: document.querySelector("#lessonSelect"),
  lessonSelectTrigger: document.querySelector("#lessonSelectTrigger"),
  lessonSelectValue: document.querySelector("#lessonSelectValue"),
  episodeLevel: document.querySelector("#episodeLevel"),
  audio: document.querySelector("#dialogueAudio"),
  playButton: document.querySelector("#playButton"),
  progressRange: document.querySelector("#progressRange"),
  currentTime: document.querySelector("#currentTime"),
  durationTime: document.querySelector("#durationTime"),
  playbackRateDisplay: document.querySelector("#playbackRateDisplay"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  loopButton: document.querySelector("#loopButton"),
  setAButton: document.querySelector("#setAButton"),
  setBButton: document.querySelector("#setBButton"),
  resetAbButton: document.querySelector("#resetAbButton"),
  aTime: document.querySelector("#aTime"),
  bTime: document.querySelector("#bTime"),
  abLine: document.querySelector("#abLine"),
  audioStatus: document.querySelector("#audioStatus"),
  staticTopic: document.querySelector("#staticTopic"),
  staticLevel: document.querySelector("#staticLevel"),
  staticVoiceSpeed: document.querySelector("#staticVoiceSpeed"),
  staticSpeakerA: document.querySelector("#staticSpeakerA"),
  staticSpeakerB: document.querySelector("#staticSpeakerB"),
  downloadTranscriptButton: document.querySelector("#downloadTranscriptButton"),
  downloadAudioButton: document.querySelector("#downloadAudioButton"),
  inlineAudioDownload: document.querySelector("#inlineAudioDownload"),
  inlinePdfDownload: document.querySelector("#inlinePdfDownload"),
  furiganaToggle: document.querySelector("#furiganaToggle"),
  dialogueList: document.querySelector("#dialogueList"),
  wordGrid: document.querySelector("#wordGrid"),
  wordCount: document.querySelector("#wordCount"),
  keyPhraseList: document.querySelector("#keyPhraseList"),
  phraseCount: document.querySelector("#phraseCount"),
  exampleList: document.querySelector("#exampleList"),
  toast: document.querySelector("#toast")
};

const state = {
  lessons: [],
  currentLesson: null,
  segments: [],
  pointA: 0,
  pointB: null,
  abLoop: false,
  toastTimer: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(value) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("zh-Hant", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function voiceSpeedLabel(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return "--";
  if (speed <= 0.85) return "慢速";
  if (speed < 1) return "學習速度";
  return "自然速度";
}

function speakerLabel(role, value, label) {
  if (label) return label;
  if (value === undefined || value === null || value === "") return "--";
  return `角色 ${role} / speaker ${value}`;
}

function createRuby(text, reading) {
  const ruby = document.createElement("ruby");
  ruby.append(document.createTextNode(text || ""));
  const rt = document.createElement("rt");
  rt.textContent = reading || "";
  ruby.append(rt);
  return ruby;
}

function createStaticSpeakButton(text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "speak-button";
  button.setAttribute("aria-label", `${text}：靜態教材不提供單句朗讀`);
  button.textContent = "♪";
  button.disabled = true;
  return button;
}

function notify(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function setHash(slug) {
  if (location.hash.slice(1) !== slug) {
    history.replaceState(null, "", `#${encodeURIComponent(slug)}`);
  }
}

function setDownload(link, href) {
  if (!href) {
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
    return;
  }
  link.href = href;
  link.removeAttribute("aria-disabled");
}

async function fetchJsonWithRetry(relativeUrl, label, attempts = 3) {
  if (location.protocol === "file:") {
    throw new Error("請透過 GitHub Pages 網址開啟教材，不能直接開啟本機 HTML 檔案");
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(relativeUrl, document.baseURI);
      url.searchParams.set("v", `${Date.now()}-${attempt}`);
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`${label}伺服器回應 HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => window.setTimeout(resolve, attempt * 700));
    }
  }
  throw new Error(`${label}讀取失敗，請確認網路後重新整理：${lastError?.message || "未知錯誤"}`);
}

function setAudioControls(enabled) {
  [
    elements.playButton,
    elements.progressRange,
    elements.backButton,
    elements.forwardButton,
    elements.loopButton,
    elements.setAButton,
    elements.setBButton,
    elements.resetAbButton
  ].forEach((control) => {
    control.disabled = !enabled;
  });
}

function resetAbLoop() {
  state.pointA = 0;
  state.pointB = null;
  state.abLoop = false;
  elements.aTime.textContent = "00:00";
  elements.bTime.textContent = "--:--";
  elements.loopButton.setAttribute("aria-pressed", "false");
}

function renderLessonList(activeSlug = "") {
  if (!state.lessons.length) {
    elements.lessonSelectValue.textContent = "尚未發布教材";
    elements.lessonList.innerHTML = '<div class="placeholder">尚未發布教材。</div>';
    return;
  }

  elements.lessonList.innerHTML = state.lessons.map((lesson) => `
    <button class="lesson-item${lesson.slug === activeSlug ? " active" : ""}" type="button" role="option" aria-selected="${lesson.slug === activeSlug}" data-slug="${escapeHtml(lesson.slug)}">
      <strong>${escapeHtml(lesson.titleJa || lesson.topicZh || lesson.slug)}</strong>
      <span>${escapeHtml(lesson.level || "")}・${escapeHtml(lesson.estimatedDuration || "")}</span>
      <span>${escapeHtml(formatDate(lesson.publishedAt))}</span>
    </button>
  `).join("");
  const active = state.lessons.find((lesson) => lesson.slug === activeSlug) || state.lessons[0];
  elements.lessonSelectValue.textContent = active?.titleJa || active?.topicZh || active?.slug || "--";
}

function renderDialogue(lesson) {
  const lines = lesson.dialogue || [];
  elements.dialogueList.replaceChildren();
  if (!lines.length) {
    elements.dialogueList.innerHTML = '<div class="placeholder">此教材沒有逐句稿。</div>';
    return;
  }
  lines.forEach((line, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dialogue-line speaker-${String(line.speaker || "A").toLowerCase()}`;
    button.dataset.index = String(index);

    const badge = document.createElement("span");
    badge.className = "speaker-badge";
    badge.textContent = line.speaker;

    const content = document.createElement("span");
    content.className = "line-content";
    const role = document.createElement("small");
    role.className = "speaker-role";
    role.textContent = line.speakerRoleZh || (line.speaker === "B" ? "角色 B" : "角色 A");
    const japanese = document.createElement("span");
    japanese.className = "japanese";
    japanese.append(createRuby(line.japanese, line.reading));
    const translation = document.createElement("small");
    translation.className = "translation";
    translation.textContent = line.translationZh;
    content.append(role, japanese, translation);

    const time = document.createElement("time");
    time.textContent = formatTime(state.segments[index]?.start);
    button.append(badge, content, time);
    elements.dialogueList.append(button);
  });
}

function renderWords(words = []) {
  elements.wordGrid.replaceChildren();
  words.forEach((word) => {
    const article = document.createElement("article");
    article.className = "word-card";
    const part = document.createElement("span");
    part.textContent = word.partOfSpeechZh;
    const heading = document.createElement("h3");
    heading.append(createRuby(word.japanese, word.reading));
    const translation = document.createElement("p");
    translation.textContent = word.translationZh;
    article.append(part, heading, translation, createStaticSpeakButton(word.japanese));
    elements.wordGrid.append(article);
  });
  if (!words.length) elements.wordGrid.innerHTML = '<div class="placeholder">此教材沒有單字。</div>';
}

function renderSentenceItems(container, items = [], includeNote = false) {
  container.replaceChildren();
  items.forEach((item, index) => {
    const article = document.createElement("article");
    const number = document.createElement("span");
    number.className = "item-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const content = document.createElement("div");
    const japanese = document.createElement("p");
    japanese.append(createRuby(item.japanese, item.reading));
    const translation = document.createElement("small");
    translation.textContent = item.translationZh;
    content.append(japanese, translation);
    if (includeNote) {
      const note = document.createElement("em");
      note.textContent = item.noteZh || "";
      content.append(note);
    }
    article.append(number, content, createStaticSpeakButton(item.japanese));
    container.append(article);
  });
  if (!items.length) container.innerHTML = '<div class="placeholder">此區沒有內容。</div>';
}

function renderLesson(lesson, basePath) {
  state.currentLesson = lesson;
  state.segments = lesson.audio?.segments || [];
  const audioSrc = `${basePath}/${lesson.assets?.audio || "audio.mp3"}`;
  const pdfSrc = `${basePath}/${lesson.assets?.pdf || "transcript.pdf"}`;
  const speed = lesson.audio?.speedScale;

  elements.episodeLevel.textContent = lesson.level || "--";
  elements.staticTopic.value = lesson.topicZh || lesson.titleZh || lesson.summaryZh || "--";
  elements.staticLevel.textContent = lesson.level || "--";
  elements.staticVoiceSpeed.textContent = lesson.audio?.speedLabel || voiceSpeedLabel(speed);
  elements.staticSpeakerA.textContent = speakerLabel("A", lesson.audio?.speakerA, lesson.audio?.speakerALabel);
  elements.staticSpeakerB.textContent = speakerLabel("B", lesson.audio?.speakerB, lesson.audio?.speakerBLabel);
  elements.playbackRateDisplay.textContent = "1.0×";
  elements.durationTime.textContent = formatTime(lesson.audio?.duration);
  elements.currentTime.textContent = "00:00";
  elements.progressRange.value = 0;
  elements.audio.src = audioSrc;
  elements.audio.load();
  elements.audioStatus.textContent = `靜態教材語音已載入，約 ${formatTime(lesson.audio?.duration)}。可點逐句稿定位。`;

  setDownload(elements.downloadAudioButton, audioSrc);
  setDownload(elements.inlineAudioDownload, audioSrc);
  setDownload(elements.downloadTranscriptButton, pdfSrc);
  setDownload(elements.inlinePdfDownload, pdfSrc);
  setAudioControls(true);
  resetAbLoop();

  renderDialogue(lesson);
  renderWords(lesson.words || []);
  renderSentenceItems(elements.keyPhraseList, lesson.keyPhrases || [], true);
  renderSentenceItems(elements.exampleList, lesson.examples || []);
  elements.wordCount.textContent = "10–14 詞";
  elements.phraseCount.textContent = "6–8 句";
}

async function loadLesson(slug) {
  const item = state.lessons.find((lesson) => lesson.slug === slug) || state.lessons[0];
  if (!item) return;
  renderLessonList(item.slug);
  setHash(item.slug);
  const basePath = `lessons/${encodeURIComponent(item.slug)}`;
  renderLesson(await fetchJsonWithRetry(`${basePath}/lesson.json`, "教材"), basePath);
}

function showError(error) {
  elements.dialogueList.innerHTML = `<div class="placeholder">${escapeHtml(error.message)}</div>`;
  elements.audioStatus.textContent = error.message;
  notify(error.message);
}

elements.lessonList.addEventListener("click", (event) => {
  const item = event.target.closest(".lesson-item");
  if (item) {
    elements.lessonSelect.classList.remove("open");
    elements.lessonList.hidden = true;
    elements.lessonSelectTrigger.setAttribute("aria-expanded", "false");
    loadLesson(item.dataset.slug).catch(showError);
  }
});

elements.lessonSelectTrigger.addEventListener("click", () => {
  const opening = !elements.lessonSelect.classList.contains("open");
  elements.lessonSelect.classList.toggle("open", opening);
  elements.lessonList.hidden = !opening;
  elements.lessonSelectTrigger.setAttribute("aria-expanded", String(opening));
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#lessonSelect")) return;
  elements.lessonSelect.classList.remove("open");
  elements.lessonList.hidden = true;
  elements.lessonSelectTrigger.setAttribute("aria-expanded", "false");
});

elements.dialogueList.addEventListener("click", (event) => {
  const line = event.target.closest(".dialogue-line");
  if (!line || !elements.audio.src) return;
  const segment = state.segments[Number(line.dataset.index)];
  if (!segment) return;
  document.querySelectorAll(".dialogue-line.active").forEach((node) => node.classList.remove("active"));
  line.classList.add("active");
  elements.audio.currentTime = segment.start;
  elements.audio.play();
});

elements.playButton.addEventListener("click", () => {
  if (elements.audio.paused) elements.audio.play();
  else elements.audio.pause();
});

elements.audio.addEventListener("play", () => {
  elements.playButton.textContent = "Ⅱ";
});

elements.audio.addEventListener("pause", () => {
  elements.playButton.textContent = "▶";
});

elements.audio.addEventListener("timeupdate", () => {
  const duration = elements.audio.duration || state.currentLesson?.audio?.duration || 0;
  elements.currentTime.textContent = formatTime(elements.audio.currentTime);
  elements.durationTime.textContent = formatTime(duration);
  elements.progressRange.value = duration ? Math.round((elements.audio.currentTime / duration) * 1000) : 0;
  if (state.abLoop && state.pointB !== null && elements.audio.currentTime >= state.pointB) {
    elements.audio.currentTime = state.pointA;
  }
});

elements.audio.addEventListener("loadedmetadata", () => {
  elements.durationTime.textContent = formatTime(elements.audio.duration || state.currentLesson?.audio?.duration);
});

elements.progressRange.addEventListener("input", () => {
  const duration = elements.audio.duration || state.currentLesson?.audio?.duration || 0;
  if (duration) elements.audio.currentTime = (Number(elements.progressRange.value) / 1000) * duration;
});

elements.backButton.addEventListener("click", () => {
  elements.audio.currentTime = Math.max(0, elements.audio.currentTime - 5);
});

elements.forwardButton.addEventListener("click", () => {
  const duration = elements.audio.duration || Number.POSITIVE_INFINITY;
  elements.audio.currentTime = Math.min(duration, elements.audio.currentTime + 5);
});

elements.setAButton.addEventListener("click", () => {
  state.pointA = elements.audio.currentTime || 0;
  elements.aTime.textContent = formatTime(state.pointA);
});

elements.setBButton.addEventListener("click", () => {
  state.pointB = elements.audio.currentTime || 0;
  elements.bTime.textContent = formatTime(state.pointB);
});

elements.resetAbButton.addEventListener("click", resetAbLoop);

elements.loopButton.addEventListener("click", () => {
  if (state.pointB === null || state.pointB <= state.pointA) {
    notify("請先設定有效的 A 起點與 B 終點");
    return;
  }
  state.abLoop = !state.abLoop;
  elements.loopButton.setAttribute("aria-pressed", String(state.abLoop));
});

elements.furiganaToggle.addEventListener("click", () => {
  const hidden = document.body.classList.toggle("hide-furigana");
  elements.furiganaToggle.setAttribute("aria-pressed", String(!hidden));
  elements.furiganaToggle.textContent = hidden ? "ふりがな OFF" : "ふりがな ON";
});

document.querySelectorAll(".bottom-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".bottom-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

async function init() {
  try {
    const payload = await fetchJsonWithRetry("lessons/index.json", "教材清單");
    state.lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    const initialSlug = decodeURIComponent(location.hash.slice(1));
    renderLessonList(initialSlug);
    if (state.lessons.length) await loadLesson(initialSlug || state.lessons[0].slug);
    else setAudioControls(false);
  } catch (error) {
    showError(error);
  }
}

init();
