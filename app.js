const CLIENT_ID = '332987792434-u7r3hdl46asbqo0si3ngqu46kdbgf2at.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const DRIVE_FILE_NAME = 'maskmark-data.json';
const LOG_PREFIX = '[MaskMark]';

const secretIdNames = [
  '晴空森林',
  '晴空河灣',
  '晴空山谷',
  '晴空海岸',
  '晴空花園',
  '晴空草原',
  '晴空湖畔',
  '晴空小徑',
  '晴空峽谷',
  '晴空樹影',
  '和風森林',
  '和風河灣',
  '和風山谷',
  '和風海岸',
  '和風花園',
  '和風草原',
  '和風湖畔',
  '和風小徑',
  '和風峽谷',
  '和風樹影',
  '輕霧森林',
  '輕霧河灣',
  '輕霧山谷',
  '輕霧海岸',
  '輕霧花園',
  '輕霧草原',
  '輕霧湖畔',
  '輕霧小徑',
  '輕霧峽谷',
  '輕霧樹影',
  '細雨森林',
  '細雨河灣',
  '細雨山谷',
  '細雨海岸',
  '細雨花園',
  '細雨草原',
  '細雨湖畔',
  '細雨小徑',
  '細雨峽谷',
  '細雨樹影',
  '晨露森林',
  '晨露河灣',
  '晨露山谷',
  '晨露海岸',
  '晨露花園',
  '晨露草原',
  '晨露湖畔',
  '晨露小徑',
  '晨露峽谷',
  '晨露樹影',
  '暮色森林',
  '暮色河灣',
  '暮色山谷',
  '暮色海岸',
  '暮色花園',
  '暮色草原',
  '暮色湖畔',
  '暮色小徑',
  '暮色峽谷',
  '暮色樹影'
];

const state = {
  gapiReady: false,
  gisReady: false,
  signedIn: false,
  userEmail: '',
  view: 'projector',
  data: { classes: [] },
  dataFileId: null,
  selectedClassId: null,
  selectedAssessmentId: null,
  individualStudentId: null,
  individualRevealed: false,
  status: '',
  error: '',
  staySignedIn: localStorage.getItem('maskmark_stay_signed_in') === '1',
  autoSignInAttempted: false,
  teacherTab: 'classes',
  showCodeStage: 'instruction',
  showCodeIndex: 0,
  showCodeRevealed: false,
  showCodeAwaitingNav: false,
  projectorRunning: false,
  projectorPhase: 'idle',
  projectorIndex: 0,
  projectorTimer: 0
};

let tokenClient = null;
let projectorInterval = null;
let idleTimeoutId = null;

const el = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  let valueAttr;
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'html') element.innerHTML = value;
    else if (key === 'disabled') element.disabled = Boolean(value);
    else if (key === 'value') valueAttr = value;
    else if (key.startsWith('on') && typeof value === 'function') element[key] = value;
    else element.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).filter(child => child !== null && child !== undefined).forEach(child => {
    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  });
  if (valueAttr !== undefined) element.value = valueAttr;
  return element;
};

function setStatus(message, isError = false) {
  if (message) console.log(LOG_PREFIX, isError ? 'ERROR' : 'STATUS', message);
  state.status = isError ? '' : message;
  state.error = isError ? message : '';
  render();
}

function logStep(...parts) {
  console.log(LOG_PREFIX, ...parts);
}

function gapiLoaded() {
  logStep('Google API script loaded, requesting client library.');
  gapi.load('client', initGapiClient);
}

async function initGapiClient() {
  try {
    logStep('正在初始化 gapi 用戶端...');
    await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
    state.gapiReady = true;
    logStep('gapi 用戶端已就緒。');
    render();
    maybeAutoSignIn();
  } catch (err) {
    console.error(err);
    setStatus('初始化 Google API 失敗，請重新整理。', true);
  }
}

function gisLoaded() {
  logStep('Google Identity Services 腳本已載入，建立權杖用戶端。');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}
  });
  state.gisReady = true;
  logStep('GIS 權杖用戶端已就緒。');
  render();
  maybeAutoSignIn();
}

async function fetchUserEmail() {
  try {
    logStep('正在取得使用者電子郵件...');
    const resp = await gapi.client.request({ path: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    state.userEmail = resp.result.email || '';
    logStep('已取得使用者電子郵件:', state.userEmail);
  } catch (err) {
    console.error('無法取得使用者資訊', err);
    state.userEmail = '';
  }
}

async function signIn() {
  if (!state.gapiReady || !state.gisReady) {
    setStatus('Google 函式庫仍在載入，請稍候。', true);
    return;
  }
  logStep('開始要求登入...');
  setStatus('正在啟動 Google 登入...');
  tokenClient.callback = resp => handleTokenResponse(resp, { silent: false });
  tokenClient.requestAccessToken({ prompt: state.signedIn ? '' : 'consent' });
}

function signOut() {
  const token = gapi.client.getToken?.()?.access_token;
  if (token) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  gapi.client.setToken('');
  state.signedIn = false;
  state.userEmail = '';
  state.data = { classes: [] };
  state.dataFileId = null;
  state.selectedClassId = null;
  state.selectedAssessmentId = null;
  state.individualStudentId = null;
  state.individualRevealed = false;
  state.autoSignInAttempted = false;
  state.staySignedIn = false;
  state.teacherTab = 'classes';
  state.showCodeStage = 'instruction';
  state.showCodeIndex = 0;
  state.showCodeRevealed = false;
  state.showCodeAwaitingNav = false;
  resetProjectorCycle();
  stopIdleTimer();
  localStorage.setItem('maskmark_stay_signed_in', '0');
  render();
}

function generateSecretIds(size) {
  const pool = [...secretIdNames];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const results = [];
  for (let i = 0; i < size; i++) {
    const base = pool[i % pool.length];
    const suffix = Math.floor(i / pool.length);
    results.push(suffix === 0 ? base : `${base}${suffix}`);
  }
  return results;
}

function ensureDefaultSelections() {
  const firstClass = state.data.classes[0];
  if (!state.selectedClassId && firstClass) {
    state.selectedClassId = firstClass.classId;
  }
  const selectedClass = state.data.classes.find(c => c.classId === state.selectedClassId);
  if (selectedClass) {
    const firstAssessment = selectedClass.assessments[0];
    if (!state.selectedAssessmentId && firstAssessment) {
      state.selectedAssessmentId = firstAssessment.assessmentId;
    }
    if (!state.individualStudentId || !selectedClass.students.find(s => s.studentId === state.individualStudentId)) {
      state.individualStudentId = selectedClass.students[0]?.studentId || null;
      state.individualRevealed = false;
    }
  }
}

function handleClassSelection(newClassId) {
  state.selectedClassId = newClassId;
  state.selectedAssessmentId = null;
  state.individualStudentId = null;
  state.individualRevealed = false;
  resetShowCodeProgress();
  resetProjectorCycle();
}

function stopProjectorTimer() {
  if (projectorInterval) {
    clearInterval(projectorInterval);
    projectorInterval = null;
  }
}

function resetProjectorCycle() {
  stopProjectorTimer();
  state.projectorRunning = false;
  state.projectorPhase = 'idle';
  state.projectorIndex = 0;
  state.projectorTimer = 0;
}

function projectorStudents(classObj) {
  if (!classObj) return [];
  return [...classObj.students].sort((a, b) => (a.secretId || '').localeCompare(b.secretId || ''));
}

function startProjectorCycle() {
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const assess = classObj?.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  const students = projectorStudents(classObj);
  if (!classObj || !assess || !students.length) return;
  resetProjectorCycle();
  state.projectorRunning = true;
  state.projectorPhase = 'ids';
  state.projectorIndex = 0;
  state.projectorTimer = 5;
  render();
  projectorInterval = setInterval(() => tickProjectorCycle(), 1000);
}

function tickProjectorCycle() {
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const assess = classObj?.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  const students = projectorStudents(classObj);
  if (!classObj || !assess || !students.length) {
    resetProjectorCycle();
    render();
    return;
  }
  if (!state.projectorRunning) {
    stopProjectorTimer();
    return;
  }
  if (state.projectorTimer > 0) {
    state.projectorTimer -= 1;
    render();
    if (state.projectorTimer > 0) return;
  }
  if (state.projectorPhase === 'ids') {
    state.projectorPhase = 'scores';
    state.projectorTimer = 1;
  } else if (state.projectorPhase === 'scores') {
    const nextIndex = state.projectorIndex + 5;
    if (nextIndex >= students.length) {
      stopProjectorTimer();
      state.projectorRunning = false;
      state.projectorPhase = 'done';
      state.projectorTimer = 0;
      state.projectorIndex = 0;
    } else {
      state.projectorIndex = nextIndex;
      state.projectorPhase = 'ids';
      state.projectorTimer = 5;
    }
  }
  render();
}

function resetShowCodeProgress() {
  state.showCodeStage = 'instruction';
  state.showCodeIndex = 0;
  state.showCodeRevealed = false;
  state.showCodeAwaitingNav = false;
}

async function loadDataFromDrive() {
  try {
    logStep('正在從 Drive 載入資料...');
    setStatus('資料載入中...');
    const listResp = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      q: `name='${DRIVE_FILE_NAME}'`
    });
    const files = listResp.result.files || [];
    if (!files.length) {
      state.data = { classes: [] };
      state.dataFileId = null;
      setStatus('尚無資料，請先建立班級。');
      ensureDefaultSelections();
      render();
      return;
    }
    const file = files[0];
    state.dataFileId = file.id;
    logStep('Found data file', file.id, 'fetching contents...');
    const dataResp = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
    state.data = dataResp.result || { classes: [] };
    logStep('已從 Drive 載入資料。');
    ensureDefaultSelections();
    setStatus('資料已載入。');
    render();
  } catch (err) {
    console.error(err);
    setStatus('從 Drive 載入資料失敗。', true);
  }
}

async function saveDataToDrive() {
  try {
    logStep('正在將資料儲存到 Drive...');
    setStatus('儲存中...');
    const metadata = state.dataFileId
      ? { name: DRIVE_FILE_NAME }
      : { name: DRIVE_FILE_NAME, parents: ['appDataFolder'] };
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const contentType = 'application/json';
    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${contentType}\r\n\r\n` +
      JSON.stringify(state.data) +
      closeDelim;

    if (state.dataFileId) {
      logStep('更新既有資料檔案', state.dataFileId);
      await gapi.client.request({
        path: `/upload/drive/v3/files/${state.dataFileId}`,
        method: 'PATCH',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
    } else {
      logStep('在 appDataFolder 中建立新資料檔案');
      const createResp = await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
      state.dataFileId = createResp.result.id;
    }
    setStatus('已儲存到 Drive。');
  } catch (err) {
    console.error(err);
    setStatus('儲存到 Drive 失敗。', true);
  }
}

async function handleTokenResponse(resp, { silent }) {
  if (resp.error) {
    console.error(resp);
    if (!silent) setStatus('登入失敗，請再試一次。', true);
    return;
  }
  try {
    logStep('已收到權杖，設定 gapi token。');
    gapi.client.setToken({ access_token: resp.access_token });
    state.signedIn = true;
    state.view = 'projector';
    if (state.staySignedIn) localStorage.setItem('maskmark_stay_signed_in', '1');
    await fetchUserEmail();
    await loadDataFromDrive();
    setStatus('已登入。');
    resetIdleTimer();
    render();
  } catch (err) {
    console.error(err);
    if (!silent) setStatus('登入失敗，請再試一次。', true);
  }
}

function maybeAutoSignIn() {
  if (!state.gapiReady || !state.gisReady || state.signedIn || !state.staySignedIn || state.autoSignInAttempted) return;
  state.autoSignInAttempted = true;
  logStep('嘗試使用已儲存的工作階段靜默登入...');
  tokenClient.callback = resp => handleTokenResponse(resp, { silent: true });
  tokenClient.requestAccessToken({ prompt: '' });
}

function stopIdleTimer() {
  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId);
    idleTimeoutId = null;
  }
}

function resetIdleTimer() {
  if (!state.signedIn) return;
  stopIdleTimer();
  const timeoutMs = state.view === 'projector' ? 180_000 : 60_000;
  const minutes = timeoutMs / 60_000;
  idleTimeoutId = setTimeout(() => {
    setStatus(`已閒置超過 ${minutes} 分鐘，已自動登出。`);
    signOut();
  }, timeoutMs);
}

function createClass({ name, size }) {
  const digits = String(size).length;
  const secretIds = generateSecretIds(size);
  const students = Array.from({ length: size }).map((_, idx) => {
    const num = String(idx + 1).padStart(digits, '0');
    return { studentId: num, secretId: secretIds[idx] };
  });
  const newClass = {
    classId: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    className: name,
    students,
    assessments: []
  };
  state.data.classes.push(newClass);
  state.selectedClassId = newClass.classId;
  state.selectedAssessmentId = null;
  saveDataToDrive();
  render();
}

function updateClassName(classId, name) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const trimmed = name.trim();
  if (!trimmed) { setStatus('班級名稱不得為空。', true); return; }
  classObj.className = trimmed;
  saveDataToDrive();
  render();
}

function deleteClass(classId) {
  const idx = state.data.classes.findIndex(c => c.classId === classId);
  if (idx === -1) return;
  state.data.classes.splice(idx, 1);
  if (state.selectedClassId === classId) {
    state.selectedClassId = state.data.classes[0]?.classId || null;
    state.selectedAssessmentId = null;
  }
  saveDataToDrive();
  render();
}

function handleSecretIdChange(classId, studentId, value) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const student = classObj.students.find(s => s.studentId === studentId);
  if (!student) return;
  student.secretId = value.trim();
}

function deleteStudent(classId, studentId) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const idx = classObj.students.findIndex(s => s.studentId === studentId);
  if (idx === -1) return;
  classObj.students.splice(idx, 1);
  classObj.assessments.forEach(a => { delete a.scores[studentId]; });
  saveDataToDrive();
  render();
}

function validateSecretIds(classObj) {
  const seen = {};
  const duplicates = new Set();
  classObj.students.forEach(s => {
    if (!s.secretId) return;
    if (seen[s.secretId]) {
      duplicates.add(s.secretId);
    }
    seen[s.secretId] = true;
  });
  return duplicates;
}

function applySecretIdChanges(classId) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const dups = validateSecretIds(classObj);
  if (dups.size) {
    setStatus('找到重複的暗號 ID，請先處理。', true);
    render();
    return;
  }
  saveDataToDrive();
}

function createAssessment(classId, { title, date, maxScore }) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const assessment = {
    assessmentId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    title,
    date,
    maxScore: Number(maxScore),
    scores: Object.fromEntries(classObj.students.map(s => [s.studentId, null]))
  };
  classObj.assessments.push(assessment);
  state.selectedAssessmentId = assessment.assessmentId;
  resetShowCodeProgress();
  saveDataToDrive();
  render();
}

function updateAssessment(classId, assessmentId, { title, date, maxScore }) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  const assess = classObj?.assessments.find(a => a.assessmentId === assessmentId);
  if (!assess) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle || Number.isNaN(maxScore)) { setStatus('請輸入標題與數字最大分數。', true); return; }
  assess.title = trimmedTitle;
  assess.date = date;
  assess.maxScore = Number(maxScore);
  saveDataToDrive();
  render();
}

function deleteAssessment(classId, assessmentId) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const idx = classObj.assessments.findIndex(a => a.assessmentId === assessmentId);
  if (idx === -1) return;
  classObj.assessments.splice(idx, 1);
  if (state.selectedAssessmentId === assessmentId) {
    state.selectedAssessmentId = classObj.assessments[0]?.assessmentId || null;
  }
  saveDataToDrive();
  render();
}

function handleScoreChange(classId, assessmentId, studentId, value) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  const assess = classObj?.assessments.find(a => a.assessmentId === assessmentId);
  if (!assess) return;
  assess.scores[studentId] = value === '' ? null : Number(value);
}

function applyScoreChanges() {
  saveDataToDrive();
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split(/,|\t/).map(cell => cell.trim()));
}

function applySecretIdImport(classId, rows, mode, options) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  if (mode === 'row-order') {
    classObj.students.forEach((s, idx) => {
      if (rows[idx] && rows[idx][options.secretIdCol]) s.secretId = rows[idx][options.secretIdCol];
    });
  } else if (mode === 'student-id') {
    const idCol = options.studentIdCol;
    const secretCol = options.secretIdCol;
    rows.forEach(r => {
      const sid = r[idCol];
      const secret = r[secretCol];
      const student = classObj.students.find(s => s.studentId === sid);
      if (student && secret) student.secretId = secret;
    });
  }
  const dups = validateSecretIds(classObj);
  if (dups.size) {
    setStatus('匯入完成但偵測到重複暗號，請先處理再儲存。', true);
  } else {
    saveDataToDrive();
  }
  render();
}

function applyScoreImport(classId, assessmentId, rows, mode) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  const assess = classObj?.assessments.find(a => a.assessmentId === assessmentId);
  if (!assess) return;
  if (mode === 'row-order') {
    classObj.students.forEach((s, idx) => {
      const raw = rows[idx]?.[0];
      if (raw === undefined || raw === '') return;
      const val = Number(raw);
      if (!Number.isNaN(val)) assess.scores[s.studentId] = val;
    });
  } else if (mode === 'student-id') {
    rows.forEach(r => {
      const [studentId, scoreRaw] = r;
      const student = classObj.students.find(s => s.studentId === studentId);
      if (!student) return;
      if (scoreRaw === undefined || scoreRaw === '') return;
      const val = Number(scoreRaw);
      if (!Number.isNaN(val)) assess.scores[student.studentId] = val;
    });
  }
  saveDataToDrive();
  render();
}

function renderLanding() {
  const staySignedCheckbox = el('input', { type: 'checkbox', onchange: e => {
    state.staySignedIn = e.target.checked;
    localStorage.setItem('maskmark_stay_signed_in', state.staySignedIn ? '1' : '0');
  } });
  staySignedCheckbox.checked = state.staySignedIn;
  return el('main', {}, [
    el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: 'MaskMark－匿名成績系統' }),
      el('p', { text: '請使用 Google 登入以管理班級、暗號與評量分數；系統不會儲存學生真實姓名。' }),
      el('div', { class: 'h-stack' }, [
        el('button', { disabled: !state.gapiReady || !state.gisReady, onclick: signIn }, '以 Google 登入'),
        (!state.gapiReady || !state.gisReady) && el('span', { class: 'muted small', text: '正在載入 Google 登入...' })
      ]),
      el('label', { class: 'h-stack', style: 'gap:8px; align-items:center;' }, [staySignedCheckbox, el('span', { text: '此裝置保持登入' })]),
      el('div', { class: 'muted small' }, `gapi 就緒：${state.gapiReady} • GIS 就緒：${state.gisReady}`),
      state.error && el('div', { class: 'status error', text: state.error })
    ])
  ]);
}

function renderHeader() {
  if (!state.signedIn) return null;
  return el('header', {}, [
    el('div', { class: 'title', text: 'MaskMark－匿名成績系統' }),
    el('div', { class: 'controls' }, [
      el('button', { class: state.view === 'projector' ? '' : 'secondary', onclick: () => { state.view = 'projector'; render(); resetIdleTimer(); } }, '投影模式'),
      el('button', { class: state.view === 'showcode' ? '' : 'secondary', onclick: () => { state.view = 'showcode'; resetProjectorCycle(); resetShowCodeProgress(); render(); resetIdleTimer(); } }, '顯碼模式'),
      el('button', { class: state.view === 'individual' ? '' : 'secondary', onclick: () => { state.view = 'individual'; resetProjectorCycle(); state.individualRevealed = false; render(); resetIdleTimer(); } }, '個別模式'),
      el('button', { class: state.view === 'teacher' ? '' : 'secondary', onclick: () => { state.view = 'teacher'; resetProjectorCycle(); render(); resetIdleTimer(); } }, '教師管理'),
      el('span', { class: 'badge', text: state.userEmail }),
      el('button', { class: 'secondary', onclick: signOut }, '登出')
    ])
  ]);
}

function renderStatus() {
  if (!state.status && !state.error) return null;
  return el('div', { class: `status ${state.error ? 'error' : ''}` }, state.error || state.status);
}

function renderProjector() {
  if (!state.data.classes.length) {
    return el('main', {}, [
      el('div', { class: 'card projector stack' }, [
        el('div', { class: 'title', text: '投影模式' }),
        el('p', { text: '尚無資料，請在教師管理中建立班級與評量。' })
      ])
    ]);
  }
  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const assess = classObj?.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  const sortedStudents = projectorStudents(classObj);
  const totalGroups = Math.ceil(sortedStudents.length / 5);
  const currentStart = Math.min(state.projectorIndex, Math.max(0, (totalGroups - 1) * 5));
  const currentGroup = sortedStudents.slice(currentStart, currentStart + 5);
  const selectors = el('div', { class: 'h-stack' }, [
    el('div', { style: 'min-width: 200px;' }, [
      el('label', { text: '班級' }),
      el('select', {
        value: state.selectedClassId,
        onchange: e => {
          handleClassSelection(e.target.value);
          ensureDefaultSelections();
          resetProjectorCycle();
          render();
        }
      }, classOptions())
    ]),
    el('div', { style: 'min-width: 200px;' }, [
      el('label', { text: '評量' }),
      el('select', {
        value: state.selectedAssessmentId || '',
        onchange: e => { state.selectedAssessmentId = e.target.value; resetProjectorCycle(); render(); }
      }, assessmentOptions(classObj))
    ])
  ]);

  let table;
  if (!classObj || !assess) {
    table = el('div', { class: 'notice', text: '請選擇班級與評量以顯示成績。' });
  } else if (!sortedStudents.length) {
    table = el('div', { class: 'notice', text: '此班級尚無學生。' });
  } else {
    const phaseLabel = state.projectorPhase === 'scores' ? '顯示分數' : state.projectorPhase === 'ids' ? '顯示暗號' : state.projectorPhase === 'done' ? '全部播放完畢' : '待開始';
    const timerLabel = state.projectorRunning ? `${state.projectorTimer} 秒剩餘` : state.projectorPhase === 'done' ? '已播放所有學生。' : '可開始播放';
    const groupLabel = totalGroups ? `第 ${Math.floor(currentStart / 5) + 1} / ${totalGroups} 組` : '';
    const cells = currentGroup.map(s => {
      const score = assess.scores[s.studentId];
      const showScore = state.projectorPhase === 'scores';
      return el('div', { class: 'projector-cell' }, [
        el('div', { class: 'projector-secret', text: s.secretId || '—' }),
        el('div', { class: 'projector-score', text: showScore ? (score === null || score === undefined ? '—' : score) : '隱藏中' })
      ]);
    });
    table = el('div', { class: 'stack' }, [
      el('div', { class: 'h-stack projector-controls' }, [
        el('button', { onclick: startProjectorCycle, disabled: !sortedStudents.length || !assess }, state.projectorRunning ? '重新開始' : '開始播放'),
        el('div', { class: 'muted', text: `${phaseLabel}${groupLabel ? ` • ${groupLabel}` : ''} • ${timerLabel}` })
      ]),
      el('div', { class: 'projector-grid' }, cells)
    ]);
  }

  return el('main', {}, [
    el('div', { class: 'projector card stack' }, [
      el('div', { class: 'title', text: '投影模式' }),
      selectors,
      table
    ])
  ]);
}

function currentShowCodeStudents(classObj) {
  if (!classObj) return [];
  return [...classObj.students].sort((a, b) => a.studentId.localeCompare(b.studentId));
}

function setShowCodeIndex(newIndex, total) {
  if (total === 0) return;
  const clamped = Math.max(0, Math.min(newIndex, total - 1));
  state.showCodeIndex = clamped;
  state.showCodeStage = 'credential';
  state.showCodeRevealed = false;
  state.showCodeAwaitingNav = false;
}

function handleShowCodeConfirm(total) {
  const nextIndex = state.showCodeIndex + 1;
  state.showCodeRevealed = false;
  state.showCodeAwaitingNav = true;
  if (nextIndex >= total) {
    state.showCodeIndex = total - 1;
    state.showCodeStage = 'instruction';
  } else {
    state.showCodeIndex = nextIndex;
    state.showCodeStage = nextIndex % 5 === 0 ? 'instruction' : 'credential';
  }
  render();
}

function renderShowCode() {
  if (!state.data.classes.length) {
    return el('main', {}, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: '顯碼模式' }),
        el('p', { text: '尚無班級，請到教師管理建立班級。' })
      ])
    ]);
  }

  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const students = currentShowCodeStudents(classObj);

  if (!classObj || !students.length) {
    return el('main', {}, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: '顯碼模式' }),
        el('p', { text: '請為此班級新增學生後再顯示暗號。' })
      ])
    ]);
  }

  if (state.showCodeIndex >= students.length) {
    state.showCodeIndex = Math.max(0, students.length - 1);
  }

  const classSelector = el('div', { class: 'h-stack' }, [
    el('div', { style: 'min-width: 220px;' }, [
      el('label', { text: '班級' }),
      el('select', {
        value: state.selectedClassId,
        onchange: e => { handleClassSelection(e.target.value); render(); }
      }, classOptions())
    ])
  ]);

  const groupStart = Math.floor(state.showCodeIndex / 5) * 5;
  const groupEnd = Math.min(groupStart + 4, students.length - 1);
  const instruction = el('div', { class: 'card stack showcode-card' }, [
    el('div', { class: 'title', text: '顯碼模式－指示畫面' }),
    el('p', {
      html: `請讓以下學生排隊，依序上前：<br/>學生學號 ${students[groupStart].studentId} 至 ${students[groupEnd].studentId}`
    }),
    el('p', { class: 'muted', text: '當這組的第一位學生站在您面前時，請按「下一位」。' }),
    el('button', {
      onclick: () => { state.showCodeStage = 'credential'; state.showCodeRevealed = false; state.showCodeAwaitingNav = false; render(); }
    }, '下一位')
  ]);

  const currentStudent = students[state.showCodeIndex];
  const navControls = el('div', { class: 'h-stack' }, [
    el('button', {
      class: 'secondary',
      disabled: state.showCodeIndex === 0,
      onclick: () => { setShowCodeIndex(state.showCodeIndex - 1, students.length); render(); }
    }, '上一位'),
    el('div', { style: 'min-width: 180px;' }, [
      el('select', {
        value: currentStudent.studentId,
        onchange: e => {
          const idx = students.findIndex(s => s.studentId === e.target.value);
          if (idx !== -1) { setShowCodeIndex(idx, students.length); render(); }
        }
      }, students.map(s => el('option', { value: s.studentId, text: s.studentId })))
    ]),
    el('button', {
      class: 'secondary',
      disabled: state.showCodeIndex >= students.length - 1,
      onclick: () => { setShowCodeIndex(state.showCodeIndex + 1, students.length); render(); }
    }, '下一位')
  ]);

  const credentialBody = state.showCodeRevealed
    ? el('div', { class: 'stack reveal-card' }, [
        el('div', { class: 'title', text: `學生學號：${currentStudent.studentId}` }),
        el('div', { class: 'big-secret', text: currentStudent.secretId || '—' }),
        el('button', {
          onclick: () => handleShowCodeConfirm(students.length)
        }, '確認並前往下一位')
      ])
      : el('div', { class: 'stack' }, [
          el('p', { text: `學生學號 ${currentStudent.studentId} 已準備好查看暗號時再按「顯示」。` }),
          el('button', { onclick: () => { state.showCodeRevealed = true; state.showCodeAwaitingNav = false; render(); } }, '顯示'),
          state.showCodeAwaitingNav && el('div', { class: 'muted', text: '暗號已隱藏，請使用導覽切換學生。' })
        ]);

  const credentialNote = state.showCodeRevealed ? null : el('div', { class: 'muted small' }, '可用導覽快速切換學生。');

  const credentialCard = el('div', { class: 'card stack showcode-card' }, [
    el('div', { class: 'title', text: '顯碼模式－暗號畫面' }),
    navControls,
    credentialBody,
    credentialNote
  ]);

  const bodyContent = state.showCodeStage === 'instruction' ? instruction : credentialCard;

  return el('main', {}, [classSelector, bodyContent]);
}

function renderIndividual() {
  if (!state.data.classes.length) {
    return el('main', {}, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: '個別模式' }),
        el('p', { text: '尚無資料，請在教師管理中建立班級與評量。' })
      ])
    ]);
  }

  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const assess = classObj?.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  if (classObj && (!state.individualStudentId || !classObj.students.find(s => s.studentId === state.individualStudentId))) {
    state.individualStudentId = classObj.students[0]?.studentId || null;
    state.individualRevealed = false;
  }

  const classSelect = el('select', {
    value: state.selectedClassId || '',
    onchange: e => { handleClassSelection(e.target.value); ensureDefaultSelections(); render(); }
  }, [el('option', { value: '', text: '請選擇班級' }), ...classOptions()]);

  const assessSelect = el('select', {
    value: state.selectedAssessmentId || '',
    onchange: e => { state.selectedAssessmentId = e.target.value; state.individualRevealed = false; render(); }
  }, assessmentOptions(classObj));

  const studentOptions = (classObj?.students || []).map(s => el('option', { value: s.studentId, text: s.studentId }));
  const studentSelect = el('select', {
    value: state.individualStudentId || '',
    onchange: e => { state.individualStudentId = e.target.value; state.individualRevealed = false; render(); }
  }, [el('option', { value: '', text: '選擇學生學號' }), ...studentOptions]);

  const student = classObj?.students.find(s => s.studentId === state.individualStudentId);
  const score = assess?.scores?.[student?.studentId ?? ''];

  let body;
  if (!classObj || !assess || !student) {
    body = el('div', { class: 'notice', text: '請選擇班級、評量與學生學號以顯示分數。' });
  } else {
    const scoreSection = state.individualRevealed
      ? el('div', { class: 'stack' }, [
          el('div', { class: 'title', text: `學號 ${student.studentId}` }),
          el('div', { class: 'muted', text: `暗號：${student.secretId || '—'}` }),
          el('div', { class: 'big-secret', text: score === null || score === undefined ? '—' : score }),
          el('button', { class: 'secondary', onclick: () => { state.individualRevealed = false; render(); } }, '隱藏分數')
        ])
      : el('div', { class: 'stack' }, [
          el('p', { text: `在顯示學號 ${student.studentId} 的分數前，請先確認學生身分。` }),
          el('button', { onclick: () => { state.individualRevealed = true; render(); } }, '顯示分數')
        ]);

    body = el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: '選定學生的分數' }),
      scoreSection
    ]);
  }

  return el('main', {}, [
    el('div', { class: 'stack' }, [
      el('div', { class: 'notice' }, '顯示分數前，請再次確認學生身分以避免冒名頂替。'),
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: '選擇學生' }),
        el('div', { class: 'h-stack' }, [
          el('div', { style: 'min-width: 200px; flex:1;' }, [el('label', { text: '班級' }), classSelect]),
          el('div', { style: 'min-width: 200px; flex:1;' }, [el('label', { text: '評量' }), assessSelect]),
          el('div', { style: 'min-width: 180px;' }, [el('label', { text: '學生學號' }), studentSelect])
        ])
      ]),
      body
    ])
  ]);
}

function classOptions() {
  return state.data.classes.map(c => el('option', { value: c.classId, text: c.className, selected: state.selectedClassId === c.classId }));
}

function assessmentOptions(classObj) {
  if (!classObj) return [el('option', { value: '', text: '尚無評量' })];
  const opts = classObj.assessments.map(a => el('option', { value: a.assessmentId, text: a.title, selected: state.selectedAssessmentId === a.assessmentId }));
  if (!opts.length) opts.push(el('option', { value: '', text: '尚無評量' }));
  return opts;
}

function renderCreateClassForm() {
  const nameInput = el('input', { placeholder: '例如：八年甲班' });
  const sizeInput = el('input', { type: 'number', min: '1', placeholder: '班級人數' });
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: '建立新班級' }),
    el('div', { class: 'h-stack' }, [
      el('div', { style: 'flex:1;' }, [el('label', { text: '班級名稱' }), nameInput]),
      el('div', { style: 'width: 180px;' }, [el('label', { text: '班級人數' }), sizeInput])
    ]),
    el('button', {
      onclick: () => {
        const name = nameInput.value.trim();
        const size = Number(sizeInput.value);
        if (!name || !size || size < 1) {
          setStatus('請輸入班級名稱與正整數人數。', true);
          return;
        }
        createClass({ name, size });
        nameInput.value = '';
        sizeInput.value = '';
      }
    }, '建立班級')
  ]);
}

function renderRosterSection(classObj) {
  if (!classObj) return el('div', { class: 'card' }, '請選擇班級以管理名冊。');
  const duplicates = validateSecretIds(classObj);
  const rows = classObj.students.map(s => {
    const input = el('input', {
      value: s.secretId,
      placeholder: '暗號',
      oninput: e => handleSecretIdChange(classObj.classId, s.studentId, e.target.value)
    });
    const td = el('td', {}, input);
    if (duplicates.has(s.secretId) && s.secretId) td.classList.add('dup');
    return el('tr', {}, [
      el('td', {}, s.studentId),
      td,
      el('td', {}, el('button', { class: 'danger secondary', onclick: () => deleteStudent(classObj.classId, s.studentId) }, '刪除'))
    ]);
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
      el('div', { class: 'title', text: '名冊：學號與暗號' }),
      el('button', { onclick: () => applySecretIdChanges(classObj.classId) }, '儲存暗號')
    ]),
    duplicates.size ? el('div', { class: 'status error', text: '偵測到重複的暗號，每個暗號必須唯一。' }) : null,
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '學生學號'), el('th', {}, '暗號'), el('th', {}, '操作')])) ,
      el('tbody', {}, rows)
    ])
  ]);
}

function renderImportSection(classObj) {
  if (!classObj) return null;
  const fileInput = el('input', { type: 'file', accept: '.csv' });
  const csvModeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: '依學生順序對應' }),
    el('option', { value: 'student-id', text: '依學號欄位對應' })
  ]);
  const pasteModeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: '依學生順序對應' }),
    el('option', { value: 'student-id', text: '依學號欄位對應' })
  ]);
  const secretIdColInput = el('input', { type: 'number', min: '1', value: '1' });
  const studentIdColInput = el('input', { type: 'number', min: '1', value: '1' });
  const pasteArea = el('textarea', { placeholder: '將試算表內容貼上於此...' });

  const handleRows = (rows, source, mode) => {
    if (!rows.length) return;
    const secretIdx = Number(secretIdColInput.value) - 1;
    const studentIdx = Number(studentIdColInput.value) - 1;
    applySecretIdImport(classObj.classId, rows, mode, { secretIdCol: secretIdx, studentIdCol: studentIdx });
    setStatus(`${source} 匯入已套用。`);
  };

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: '匯入暗號' }),
    el('div', { class: 'small muted' }, '匯入會覆寫符合學生的既有暗號，偵測到重複會先提示。'),
    el('div', { class: 'stack' }, [
      el('label', { text: '上傳 CSV（Google Sheets/Excel 匯出）' }),
      el('input', { type: 'file', accept: '.csv', onchange: e => { fileInput.files = e.target.files; } }),
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: '對應方式' }), csvModeSelect]),
        el('div', { style: 'width: 120px;' }, [el('label', { text: '暗號欄位序號（1 起算）' }), secretIdColInput]),
        el('div', { style: 'width: 160px;' }, [el('label', { text: '學號欄位序號（學號對應模式）' }), studentIdColInput])
      ]),
      el('button', {
        onclick: () => {
          const file = fileInput.files?.[0];
          if (!file) { setStatus('請先選擇 CSV 檔案。', true); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const rows = parseCsv(reader.result);
            handleRows(rows, 'CSV', csvModeSelect.value);
          };
          reader.readAsText(file);
        }
      }, '上傳 CSV')
    ]),
    el('div', { class: 'stack' }, [
      el('label', { text: '從試算表複製貼上' }),
      pasteArea,
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: '對應方式' }), pasteModeSelect])
      ]),
      el('button', {
        onclick: () => {
          const rows = parseCsv(pasteArea.value);
          handleRows(rows, 'Paste', pasteModeSelect.value);
          pasteArea.value = '';
        }
      }, '套用貼上資料')
    ])
  ]);
}

function renderAssessmentsSection(classObj) {
  if (!classObj) return el('div', { class: 'card' }, '請先選擇班級以管理評量。');
  const titleInput = el('input', { placeholder: '評量標題' });
  const dateInput = el('input', { type: 'date' });
  const maxInput = el('input', { type: 'number', min: '0', placeholder: '滿分' });

  const assessmentList = classObj.assessments.map(a => el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
    el('div', {}, [el('strong', {}, a.title), el('div', { class: 'small muted', text: `${a.date || '未填日期'} • 滿分 ${a.maxScore}` })]),
    el('div', { class: 'h-stack' }, [
      el('button', { class: state.selectedAssessmentId === a.assessmentId ? '' : 'secondary', onclick: () => { state.selectedAssessmentId = a.assessmentId; render(); } }, '開啟'),
      el('button', { class: 'danger secondary', onclick: () => deleteAssessment(classObj.classId, a.assessmentId) }, '刪除')
    ])
  ]));

  const selected = classObj.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  let editCard = null;
  if (selected) {
    const editTitle = el('input', { value: selected.title, placeholder: '評量標題' });
    const editDate = el('input', { type: 'date', value: selected.date || '' });
    const editMax = el('input', { type: 'number', min: '0', value: selected.maxScore ?? '' });
    editCard = el('div', { class: 'card stack' }, [
      el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
        el('div', { class: 'title', text: `編輯 ${selected.title}` }),
        el('div', { class: 'h-stack' }, [
          el('button', { class: 'secondary', onclick: () => updateAssessment(classObj.classId, selected.assessmentId, { title: editTitle.value, date: editDate.value, maxScore: Number(editMax.value) }) }, '儲存變更'),
          el('button', { class: 'danger secondary', onclick: () => deleteAssessment(classObj.classId, selected.assessmentId) }, '刪除此評量')
        ])
      ]),
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: '標題' }), editTitle]),
        el('div', { style: 'width:160px;' }, [el('label', { text: '日期' }), editDate]),
        el('div', { style: 'width:140px;' }, [el('label', { text: '滿分' }), editMax])
      ])
    ]);
  }

  return el('div', { class: 'stack' }, [
    el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: '評量清單' }),
      assessmentList.length ? el('div', { class: 'stack' }, assessmentList) : el('div', { class: 'muted' }, '尚無評量。'),
      el('div', { class: 'stack', style: 'border-top:1px solid var(--border); padding-top:12px;' }, [
        el('div', { class: 'title', text: '新增評量' }),
        el('div', { class: 'h-stack' }, [
          el('div', { style: 'flex:1;' }, [el('label', { text: '標題' }), titleInput]),
          el('div', { style: 'width:160px;' }, [el('label', { text: '日期' }), dateInput]),
          el('div', { style: 'width:140px;' }, [el('label', { text: '滿分' }), maxInput])
        ]),
        el('button', {
          onclick: () => {
            const title = titleInput.value.trim();
            const date = dateInput.value;
            const max = Number(maxInput.value);
            if (!title || Number.isNaN(max)) { setStatus('請輸入標題與最大分數。', true); return; }
            createAssessment(classObj.classId, { title, date, maxScore: max });
            titleInput.value = '';
            dateInput.value = '';
            maxInput.value = '';
          }
        }, '建立評量')
      ])
    ]),
    editCard
  ]);
}

function renderClassListCard() {
  if (!state.data.classes.length) return el('div', { class: 'card' }, '尚無班級，請先建立。');
  const rows = state.data.classes.map(c => {
    const nameInput = el('input', { value: c.className });
    return el('tr', {}, [
      el('td', {}, nameInput),
      el('td', {}, `${c.students.length} 名學生`),
      el('td', {}, el('div', { class: 'h-stack' }, [
        el('button', { class: state.selectedClassId === c.classId ? '' : 'secondary', onclick: () => { state.selectedClassId = c.classId; state.selectedAssessmentId = null; render(); } }, '開啟'),
        el('button', { class: 'secondary', onclick: () => updateClassName(c.classId, nameInput.value) }, '儲存名稱'),
        el('button', { class: 'danger secondary', onclick: () => deleteClass(c.classId) }, '刪除班級')
      ]))
    ]);
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: '已建立的班級' }),
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '班級名稱'), el('th', {}, '學生數'), el('th', {}, '操作')])),
      el('tbody', {}, rows)
    ])
  ]);
}

function renderClassSelectorCard() {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack' }, [
      el('div', { style: 'flex:1;' }, [
        el('label', { text: '選擇班級' }),
        el('select', {
          value: state.selectedClassId || '',
          onchange: e => { handleClassSelection(e.target.value); render(); }
        }, [el('option', { value: '', text: '請選擇班級' }), ...classOptions()])
      ])
    ])
  ]);
}

function renderClassTab() {
  return el('div', { class: 'stack' }, [renderCreateClassForm(), renderClassListCard()]);
}

function renderStudentTab(classObj) {
  return el('div', { class: 'stack' }, [renderClassSelectorCard(), renderRosterSection(classObj), renderImportSection(classObj)]);
}

function renderAssessmentTab(classObj) {
  return el('div', { class: 'stack' }, [renderClassSelectorCard(), renderAssessmentsSection(classObj), renderScoresSection(classObj)]);
}

function renderScoresSection(classObj) {
  if (!classObj) return null;
  const assess = classObj.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  if (!assess) return el('div', { class: 'card' }, 'Select an assessment to edit scores.');
  const rows = classObj.students.map(s => {
    const input = el('input', {
      type: 'number',
      value: assess.scores[s.studentId] ?? '',
      oninput: e => handleScoreChange(classObj.classId, assess.assessmentId, s.studentId, e.target.value)
    });
    return el('tr', {}, [
      el('td', {}, s.studentId),
      el('td', {}, s.secretId || '—'),
      el('td', {}, input)
    ]);
  });

  const pasteArea = el('textarea', { placeholder: '貼上分數（單欄依座次；或學號,分數 以學號模式對應）' });
  const modeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: '依學生順序對應' }),
    el('option', { value: 'student-id', text: '依學號對應' })
  ]);

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
      el('div', { class: 'title', text: `${assess.title} 的分數` }),
      el('button', { onclick: applyScoreChanges }, '儲存分數')
    ]),
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '學生學號'), el('th', {}, '暗號'), el('th', {}, '分數')])),
      el('tbody', {}, rows)
    ]),
    el('div', { class: 'stack' }, [
      el('label', { text: '貼上分數' }),
      modeSelect,
      pasteArea,
      el('button', {
        onclick: () => {
          const rows = parseCsv(pasteArea.value);
          if (!rows.length) { setStatus('請先貼上資料列。', true); return; }
          applyScoreImport(classObj.classId, assess.assessmentId, rows, modeSelect.value);
          pasteArea.value = '';
        }
      }, '套用貼上資料')
    ])
  ]);
}

function renderTeacherPanel() {
  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);

  const tabButtons = el('div', { class: 'tabs' }, [
    el('button', { class: state.teacherTab === 'classes' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'classes'; render(); } }, '班級管理'),
    el('button', { class: state.teacherTab === 'students' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'students'; render(); } }, '學生暗號'),
    el('button', { class: state.teacherTab === 'assessments' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'assessments'; render(); } }, '評量管理')
  ]);

  let content;
  if (state.teacherTab === 'classes') {
    content = renderClassTab();
  } else if (state.teacherTab === 'students') {
    content = renderStudentTab(classObj);
  } else {
    content = renderAssessmentTab(classObj);
  }

  return el('main', {}, [
    renderStatus(),
    tabButtons,
    content,
    renderStatus()
  ]);
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (!state.signedIn) {
    app.appendChild(renderLanding());
    return;
  }
  const header = renderHeader();
  if (header) app.appendChild(header);
  const view =
    state.view === 'projector'
      ? renderProjector()
      : state.view === 'showcode'
        ? renderShowCode()
        : state.view === 'individual'
          ? renderIndividual()
          : renderTeacherPanel();
  app.appendChild(view);
}

['click', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  document.addEventListener(evt, () => resetIdleTimer(), true);
});

document.addEventListener('DOMContentLoaded', () => {
  logStep('DOM fully loaded, initial render.');
  render();
  if (window.gapi) gapiLoaded();
});
