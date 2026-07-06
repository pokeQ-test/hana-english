const STORAGE_KEY = "hanaEnglishProgress.v1";
const QUESTION_LIMIT = 10;

let baseWords = [];
let words = [];
let progressMap = {};
let currentMode = "all";
let lastQuizSettings = null;
let quizQueue = [];
let currentIndex = 0;
let currentWord = null;
let currentAnswered = false;
let sessionCorrect = 0;
let sessionWrongWords = [];

const screens = [
    "homeScreen",
    "modeScreen",
    "quizScreen",
    "resultScreen",
    "listScreen"
];

const modeLabels = {
    all:"全体ランダム",
    part:"品詞別",
    range:"番号範囲",
    wrong:"よく間違えた",
    unattempted:"未実施"
};

const questionLabels = {
    choice:"4択問題",
    spelling:"単語訳からスペルを書く"
};

document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadWords();
});

async function loadWords(){
    try{
        const response = await fetch("words.json", { cache:"no-store" });
        if(!response.ok){
            throw new Error("words.json not found");
        }
        const data = await response.json();
        initializeWords(data);
    }catch(error){
        document.getElementById("loadNotice").hidden = false;
    }
}

function bindEvents(){
    document.querySelectorAll("#modeButtons button").forEach(button => {
        button.addEventListener("click", () => selectMode(button.dataset.mode));
    });

    document.getElementById("jsonFileInput").addEventListener("change", event => {
        const file = event.target.files[0];
        if(!file){
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try{
                initializeWords(JSON.parse(reader.result));
                document.getElementById("loadNotice").hidden = true;
            }catch(error){
                alert("words.json を読み込めませんでした。");
            }
        };
        reader.readAsText(file, "utf-8");
    });

    document.getElementById("answerInput").addEventListener("keydown", event => {
        if(event.key === "Enter"){
            submitTextAnswer();
        }
    });

    ["listPartFilter", "onlyUnattempted", "onlyWeak"].forEach(id => {
        document.getElementById(id).addEventListener("change", renderWordList);
    });

    selectMode("all");
}

function cleanStudyText(value){
    const text = String(value).trim();

    // Excel由来の「受諾するジュダク」のような末尾の読みだけを表示から外します。
    return text.replace(/(.+?)([\u30A1-\u30FA]+)$/u, (match, head) => {
        return /[一-龯々]/.test(head) ? head.trim() : match;
    });
}
function initializeWords(data){
    baseWords = data.map((item, index) => ({
        id:Number(item.id || item.number || index + 1),
        word:String(item.word || "").trim(),
        meaning:cleanStudyText(item.meaning || ""),
        partOfSpeech:cleanStudyText(item.partOfSpeech || item.part || "その他") || "その他",
        level:String(item.level || "").trim(),
        example:String(item.example || "").trim(),
        exampleJa:String(item.exampleJa || item.exampleTranslation || "").trim(),
        attemptCount:Number(item.attemptCount || 0),
        correctCount:Number(item.correctCount || 0),
        wrongCount:Number(item.wrongCount || 0)
    })).filter(item => item.word && item.meaning);

    progressMap = loadProgress();
    mergeProgress();
    setupPartSelects();
    updateHomeStats();
    renderWordList();
}

function loadProgress(){
    try{
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    }catch(error){
        return {};
    }
}

function saveProgress(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressMap));
}

function mergeProgress(){
    words = baseWords.map(word => {
        const saved = progressMap[word.id] || {};
        return {
            ...word,
            attemptCount:Number(saved.attemptCount ?? word.attemptCount ?? 0),
            correctCount:Number(saved.correctCount ?? word.correctCount ?? 0),
            wrongCount:Number(saved.wrongCount ?? word.wrongCount ?? 0),
            lastAnsweredAt:saved.lastAnsweredAt || "",
            lastResult:saved.lastResult || ""
        };
    });
}

function setupPartSelects(){
    const parts = [...new Set(words.map(word => word.partOfSpeech))].sort((a,b) => a.localeCompare(b, "ja"));
    const optionHtml = parts.map(part => `<option value="${escapeHtml(part)}">${escapeHtml(part)}</option>`).join("");

    document.getElementById("partSelect").innerHTML = optionHtml;
    document.getElementById("listPartFilter").innerHTML = `<option value="all">すべて</option>${optionHtml}`;
}

function showScreen(screenId){
    screens.forEach(id => {
        document.getElementById(id).classList.toggle("active-screen", id === screenId);
    });

    if(screenId === "homeScreen"){
        mergeProgress();
        updateHomeStats();
    }

    if(screenId === "listScreen"){
        mergeProgress();
        renderWordList();
    }

    window.scrollTo({ top:0, behavior:"smooth" });
}

function updateHomeStats(){
    const total = words.length;
    const attempted = words.filter(word => word.attemptCount > 0).length;
    const weak = words.filter(word => word.wrongCount > 0).length;
    const totalAttempts = sum(words, "attemptCount");
    const totalCorrect = sum(words, "correctCount");
    const accuracy = totalAttempts === 0 ? 0 : Math.round(totalCorrect / totalAttempts * 100);

    setText("totalCount", total);
    setText("attemptedCount", attempted);
    setText("unattemptedCount", total - attempted);
    setText("weakCount", weak);
    setText("accuracyRate", `${accuracy}%`);
}

function selectMode(mode){
    currentMode = mode;
    document.querySelectorAll("#modeButtons button").forEach(button => {
        button.classList.toggle("selected", button.dataset.mode === mode);
    });
    document.getElementById("partOptions").hidden = mode !== "part";
    document.getElementById("rangeOptions").hidden = mode !== "range";
    setText("modeMessage", "");
}

function quickStart(){
    startQuiz({ mode:"all", questionType:"choice" });
}

function startQuizFromSettings(){
    const settings = {
        mode:currentMode,
        questionType:document.getElementById("questionType").value,
        part:document.getElementById("partSelect").value,
        start:Number(document.getElementById("startNumber").value),
        end:Number(document.getElementById("endNumber").value)
    };
    startQuiz(settings);
}

function startQuiz(settings){
    mergeProgress();

    const candidates = getCandidates(settings);
    if(candidates.length === 0){
        setText("modeMessage", "この条件で出題できる単語がありません。");
        return;
    }

    lastQuizSettings = { ...settings };
    quizQueue = chooseQuestions(candidates, settings.mode);
    currentIndex = 0;
    sessionCorrect = 0;
    sessionWrongWords = [];
    showScreen("quizScreen");
    renderQuestion();
}

function getCandidates(settings){
    if(settings.mode === "part"){
        return words.filter(word => word.partOfSpeech === settings.part);
    }

    if(settings.mode === "range"){
        if(!settings.start || !settings.end || settings.start > settings.end){
            setText("modeMessage", "開始番号と終了番号を正しく入力してください。");
            return [];
        }
        return words.filter(word => word.id >= settings.start && word.id <= settings.end);
    }

    if(settings.mode === "wrong"){
        return words.filter(word => word.wrongCount > 0).sort((a,b) => b.wrongCount - a.wrongCount);
    }

    if(settings.mode === "unattempted"){
        return words.filter(word => word.attemptCount === 0);
    }

    return [...words];
}

function chooseQuestions(candidates, mode){
    const count = Math.min(QUESTION_LIMIT, candidates.length);
    if(mode === "wrong"){
        return candidates.slice(0, count);
    }
    return shuffle([...candidates]).slice(0, count);
}

function renderQuestion(){
    currentWord = quizQueue[currentIndex];
    currentAnswered = false;

    setText("quizProgress", `${currentIndex + 1} / ${quizQueue.length}`);
    setText("questionKind", questionLabels[lastQuizSettings.questionType]);

    const isSpellingQuestion = lastQuizSettings.questionType === "spelling";
    setText("questionText", isSpellingQuestion ? currentWord.meaning : currentWord.word);

    document.getElementById("choiceArea").innerHTML = "";
    document.getElementById("feedbackPanel").hidden = true;
    document.getElementById("answerInput").value = "";

    if(lastQuizSettings.questionType === "choice"){
        document.getElementById("textAnswerArea").hidden = true;
        renderChoices();
    }else{
        document.getElementById("textAnswerArea").hidden = false;
        document.getElementById("answerInput").placeholder = "英単語のスペルを入力";
        setTimeout(() => document.getElementById("answerInput").focus(), 100);
    }
}

function renderChoices(){
    const choices = createChoices(currentWord);
    document.getElementById("choiceArea").innerHTML = choices.map(choice => `
        <button class="choice-button" type="button" data-correct="${choice.correct}">
            ${escapeHtml(choice.text)}
        </button>
    `).join("");

    document.querySelectorAll(".choice-button").forEach(button => {
        button.addEventListener("click", () => submitChoice(button));
    });
}

function createChoices(correctWord){
    const wrongMeanings = shuffle(words
        .filter(word => word.id !== correctWord.id && word.meaning !== correctWord.meaning)
        .map(word => word.meaning)
    ).slice(0, 3);

    return shuffle([
        { text:correctWord.meaning, correct:true },
        ...wrongMeanings.map(text => ({ text, correct:false }))
    ]);
}

function submitChoice(button){
    if(currentAnswered){
        return;
    }
    const isCorrect = button.dataset.correct === "true";
    document.querySelectorAll(".choice-button").forEach(choiceButton => {
        choiceButton.disabled = true;
        if(choiceButton.dataset.correct === "true"){
            choiceButton.classList.add("correct");
        }
    });
    if(!isCorrect){
        button.classList.add("wrong");
    }
    finishAnswer(isCorrect);
}

function submitTextAnswer(){
    if(currentAnswered){
        return;
    }
    const answer = document.getElementById("answerInput").value.trim();
    if(!answer){
        return;
    }

    const isCorrect = normalizeEnglish(answer) === normalizeEnglish(currentWord.word);

    finishAnswer(isCorrect);
}

function finishAnswer(isCorrect){
    currentAnswered = true;
    updateWordProgress(currentWord.id, isCorrect);

    if(isCorrect){
        sessionCorrect++;
    }else{
        sessionWrongWords.push(currentWord);
    }

    showFeedback(isCorrect);
    updateHomeStats();
}

function updateWordProgress(id, isCorrect){
    const current = progressMap[id] || { attemptCount:0, correctCount:0, wrongCount:0 };
    current.attemptCount = Number(current.attemptCount || 0) + 1;
    current.correctCount = Number(current.correctCount || 0) + (isCorrect ? 1 : 0);
    current.wrongCount = Number(current.wrongCount || 0) + (isCorrect ? 0 : 1);
    current.lastAnsweredAt = new Date().toISOString();
    current.lastResult = isCorrect ? "correct" : "wrong";
    progressMap[id] = current;
    saveProgress();
    mergeProgress();
}

function showFeedback(isCorrect){
    const panel = document.getElementById("feedbackPanel");
    const title = document.getElementById("feedbackTitle");

    title.className = `feedback-title ${isCorrect ? "correct" : "wrong"}`;
    title.textContent = isCorrect ? "正解！よくできました" : "おしい！答えを確認しよう";

    setText("feedbackWord", currentWord.word);
    setText("feedbackMeaning", currentWord.meaning);
    setText("feedbackPart", `${currentWord.partOfSpeech}${currentWord.level ? ` / Lv.${currentWord.level}` : ""}`);
    setText("feedbackExample", currentWord.example || "例文はありません。");
    setText("feedbackExampleJa", currentWord.exampleJa || "");

    panel.hidden = false;
    panel.scrollIntoView({ behavior:"smooth", block:"nearest" });
}

function goNextQuestion(){
    if(currentIndex + 1 >= quizQueue.length){
        showResult();
        return;
    }
    currentIndex++;
    renderQuestion();
}

function showResult(){
    const total = quizQueue.length;
    const wrong = total - sessionCorrect;
    const rate = total === 0 ? 0 : Math.round(sessionCorrect / total * 100);

    setText("resultRate", `${rate}%`);
    setText("resultTotal", total);
    setText("resultCorrect", sessionCorrect);
    setText("resultWrong", wrong);

    const wrongList = document.getElementById("wrongList");
    if(sessionWrongWords.length === 0){
        wrongList.innerHTML = `<div class="wrong-item">間違えた単語はありません。すばらしいです。</div>`;
    }else{
        wrongList.innerHTML = sessionWrongWords.map(word => `
            <div class="wrong-item">
                <strong>No.${word.id} ${escapeHtml(word.word)}</strong><br>
                ${escapeHtml(word.meaning)}
            </div>
        `).join("");
    }

    showScreen("resultScreen");
}

function retryQuiz(){
    if(lastQuizSettings){
        startQuiz(lastQuizSettings);
    }
}

function confirmExitQuiz(){
    if(confirm("クイズを終了してホームに戻りますか？")){
        showScreen("homeScreen");
    }
}

function speakCurrentWord(){
    const word = currentWord ? currentWord.word : "";
    if(!word || !("speechSynthesis" in window)){
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

function renderWordList(){
    const part = document.getElementById("listPartFilter").value;
    const onlyUnattempted = document.getElementById("onlyUnattempted").checked;
    const onlyWeak = document.getElementById("onlyWeak").checked;

    let list = [...words];
    if(part && part !== "all"){
        list = list.filter(word => word.partOfSpeech === part);
    }
    if(onlyUnattempted){
        list = list.filter(word => word.attemptCount === 0);
    }
    if(onlyWeak){
        list = list.filter(word => word.wrongCount > 0);
    }

    document.getElementById("wordList").innerHTML = list.map(word => {
        const rate = word.attemptCount === 0 ? 0 : Math.round(word.correctCount / word.attemptCount * 100);
        return `
            <article class="word-item">
                <div class="word-item-title">
                    <strong>${escapeHtml(word.word)}</strong>
                    <span class="word-number">No.${word.id}</span>
                </div>
                <div>${escapeHtml(word.meaning)}</div>
                <div class="word-meta">${escapeHtml(word.partOfSpeech)}${word.level ? ` / Lv.${escapeHtml(word.level)}` : ""}</div>
                <div class="word-stats">
                    <span>解答 ${word.attemptCount}</span>
                    <span>正解 ${word.correctCount}</span>
                    <span>正答率 ${rate}%</span>
                </div>
            </article>
        `;
    }).join("") || `<div class="word-item">条件に合う単語がありません。</div>`;
}

function isMeaningAccepted(answer, meaning){
    const normalizedAnswer = normalizeJapanese(answer);
    const normalizedMeaning = normalizeJapanese(meaning);
    if(!normalizedAnswer){
        return false;
    }
    if(normalizedMeaning.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedMeaning)){
        return true;
    }

    return splitMeaning(meaning).some(part => {
        const normalizedPart = normalizeJapanese(part);
        return normalizedPart && (
            normalizedPart.includes(normalizedAnswer) ||
            normalizedAnswer.includes(normalizedPart)
        );
    });
}

function splitMeaning(meaning){
    return meaning.split(/[、,，・／/\[\]（）()「」\s]+/).filter(Boolean);
}

function normalizeEnglish(value){
    return String(value).trim().toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeJapanese(value){
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[\s　。、,，.．!！?？・「」『』（）()\[\]【】]/g, "");
}

function shuffle(array){
    for(let i = array.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function sum(items, key){
    return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function setText(id, value){
    document.getElementById(id).textContent = value;
}

function escapeHtml(value){
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
