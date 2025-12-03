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
    logStep('Initializing gapi client...');
    await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
    state.gapiReady = true;
    logStep('gapi client ready.');
    render();
    maybeAutoSignIn();
  } catch (err) {
    console.error(err);
    setStatus('Failed to initialize Google API. Please refresh.', true);
  }
}

function gisLoaded() {
  logStep('Google Identity Services script loaded, creating token client.');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}
  });
  state.gisReady = true;
  logStep('GIS token client ready.');
  render();
  maybeAutoSignIn();
}

async function fetchUserEmail() {
  try {
    logStep('Fetching user email...');
    const resp = await gapi.client.request({ path: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    state.userEmail = resp.result.email || '';
    logStep('User email loaded:', state.userEmail);
  } catch (err) {
    console.error('Failed to fetch user info', err);
    state.userEmail = '';
  }
}

async function signIn() {
  if (!state.gapiReady || !state.gisReady) {
    setStatus('Google libraries are still loading. Please wait.', true);
    return;
  }
  logStep('Starting sign-in request...');
  setStatus('Starting Google sign-in...');
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
    logStep('Loading data from Drive...');
    setStatus('Loading data...');
    const listResp = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      q: `name='${DRIVE_FILE_NAME}'`
    });
    const files = listResp.result.files || [];
    if (!files.length) {
      state.data = { classes: [] };
      state.dataFileId = null;
      setStatus('No data found. Start by creating a class.');
      ensureDefaultSelections();
      render();
      return;
    }
    const file = files[0];
    state.dataFileId = file.id;
    logStep('Found data file', file.id, 'fetching contents...');
    const dataResp = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
    state.data = dataResp.result || { classes: [] };
    logStep('Data loaded from Drive.');
    ensureDefaultSelections();
    setStatus('Data loaded.');
    render();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load data from Drive.', true);
  }
}

async function saveDataToDrive() {
  try {
    logStep('Saving data to Drive...');
    setStatus('Saving...');
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
      logStep('Updating existing data file', state.dataFileId);
      await gapi.client.request({
        path: `/upload/drive/v3/files/${state.dataFileId}`,
        method: 'PATCH',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
    } else {
      logStep('Creating new data file in appDataFolder');
      const createResp = await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
      state.dataFileId = createResp.result.id;
    }
    setStatus('Saved to Drive.');
  } catch (err) {
    console.error(err);
    setStatus('Failed to save to Drive.', true);
  }
}

async function handleTokenResponse(resp, { silent }) {
  if (resp.error) {
    console.error(resp);
    if (!silent) setStatus('Sign-in failed. Please try again.', true);
    return;
  }
  try {
    logStep('Token received, setting gapi token.');
    gapi.client.setToken({ access_token: resp.access_token });
    state.signedIn = true;
    state.view = 'projector';
    if (state.staySignedIn) localStorage.setItem('maskmark_stay_signed_in', '1');
    await fetchUserEmail();
    await loadDataFromDrive();
    setStatus('Signed in.');
    render();
  } catch (err) {
    console.error(err);
    if (!silent) setStatus('Sign-in failed. Please try again.', true);
  }
}

function maybeAutoSignIn() {
  if (!state.gapiReady || !state.gisReady || state.signedIn || !state.staySignedIn || state.autoSignInAttempted) return;
  state.autoSignInAttempted = true;
  logStep('Attempting silent sign-in with saved session...');
  tokenClient.callback = resp => handleTokenResponse(resp, { silent: true });
  tokenClient.requestAccessToken({ prompt: '' });
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
  if (!trimmed) { setStatus('Class name cannot be empty.', true); return; }
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
    setStatus('Duplicate secret IDs found. Please resolve.', true);
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
  if (!trimmedTitle || Number.isNaN(maxScore)) { setStatus('Enter a title and numeric max score.', true); return; }
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
    setStatus('Import complete with duplicates detected. Resolve before saving.', true);
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
      el('div', { class: 'title', text: 'MaskMark – Anonymous Classroom Scores' }),
      el('p', { text: 'Sign in with Google to manage classes, secret IDs, and assessment scores. No student names are stored.' }),
      el('div', { class: 'h-stack' }, [
        el('button', { disabled: !state.gapiReady || !state.gisReady, onclick: signIn }, 'Sign in with Google'),
        (!state.gapiReady || !state.gisReady) && el('span', { class: 'muted small', text: 'Loading Google Sign-In...' })
      ]),
      el('label', { class: 'h-stack', style: 'gap:8px; align-items:center;' }, [staySignedCheckbox, el('span', { text: 'Stay signed in on this device' })]),
      el('div', { class: 'muted small' }, `gapi ready: ${state.gapiReady} • GIS ready: ${state.gisReady}`),
      state.error && el('div', { class: 'status error', text: state.error })
    ])
  ]);
}

function renderHeader() {
  if (!state.signedIn) return null;
  return el('header', {}, [
    el('div', { class: 'title', text: 'MaskMark – Anonymous Classroom Scores' }),
    el('div', { class: 'controls' }, [
      el('button', { class: state.view === 'projector' ? '' : 'secondary', onclick: () => { state.view = 'projector'; render(); } }, 'Projector Mode'),
      el('button', { class: state.view === 'showcode' ? '' : 'secondary', onclick: () => { state.view = 'showcode'; resetProjectorCycle(); resetShowCodeProgress(); render(); } }, 'Show Code Mode'),
      el('button', { class: state.view === 'individual' ? '' : 'secondary', onclick: () => { state.view = 'individual'; resetProjectorCycle(); state.individualRevealed = false; render(); } }, 'Individual Mode'),
      el('button', { class: state.view === 'teacher' ? '' : 'secondary', onclick: () => { state.view = 'teacher'; resetProjectorCycle(); render(); } }, 'Teacher Panel'),
      el('span', { class: 'badge', text: state.userEmail }),
      el('button', { class: 'secondary', onclick: signOut }, 'Sign out')
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
        el('div', { class: 'title', text: 'Projector Mode' }),
        el('p', { text: 'No data yet. Create classes and assessments in the Teacher Panel.' })
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
      el('label', { text: 'Class' }),
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
      el('label', { text: 'Assessment' }),
      el('select', {
        value: state.selectedAssessmentId || '',
        onchange: e => { state.selectedAssessmentId = e.target.value; resetProjectorCycle(); render(); }
      }, assessmentOptions(classObj))
    ])
  ]);

  let table;
  if (!classObj || !assess) {
    table = el('div', { class: 'notice', text: 'Select a class and assessment to display scores.' });
  } else if (!sortedStudents.length) {
    table = el('div', { class: 'notice', text: 'No students in this class yet.' });
  } else {
    const phaseLabel = state.projectorPhase === 'scores' ? 'Scores showing' : state.projectorPhase === 'ids' ? 'Secret IDs showing' : state.projectorPhase === 'done' ? 'Cycle complete' : 'Waiting to start';
    const timerLabel = state.projectorRunning ? `${state.projectorTimer}s remaining` : state.projectorPhase === 'done' ? 'Finished all students.' : 'Ready to start';
    const groupLabel = totalGroups ? `Group ${Math.floor(currentStart / 5) + 1} of ${totalGroups}` : '';
    const cells = currentGroup.map(s => {
      const score = assess.scores[s.studentId];
      const showScore = state.projectorPhase === 'scores';
      return el('div', { class: 'projector-cell' }, [
        el('div', { class: 'projector-secret', text: s.secretId || '—' }),
        el('div', { class: 'projector-score', text: showScore ? (score === null || score === undefined ? '—' : score) : 'Hidden' })
      ]);
    });
    table = el('div', { class: 'stack' }, [
      el('div', { class: 'h-stack projector-controls' }, [
        el('button', { onclick: startProjectorCycle, disabled: !sortedStudents.length || !assess }, state.projectorRunning ? 'Restart sequence' : 'Start sequence'),
        el('div', { class: 'muted', text: `${phaseLabel}${groupLabel ? ` • ${groupLabel}` : ''} • ${timerLabel}` })
      ]),
      el('div', { class: 'projector-grid' }, cells)
    ]);
  }

  return el('main', {}, [
    el('div', { class: 'projector card stack' }, [
      el('div', { class: 'title', text: 'Projector Mode' }),
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
        el('div', { class: 'title', text: 'Show Code Mode' }),
        el('p', { text: 'No classes yet. Create a class in the Teacher Panel.' })
      ])
    ]);
  }

  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);
  const students = currentShowCodeStudents(classObj);

  if (!classObj || !students.length) {
    return el('main', {}, [
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: 'Show Code Mode' }),
        el('p', { text: 'Add students to this class to reveal codes.' })
      ])
    ]);
  }

  if (state.showCodeIndex >= students.length) {
    state.showCodeIndex = Math.max(0, students.length - 1);
  }

  const classSelector = el('div', { class: 'h-stack' }, [
    el('div', { style: 'min-width: 220px;' }, [
      el('label', { text: 'Class' }),
      el('select', {
        value: state.selectedClassId,
        onchange: e => { handleClassSelection(e.target.value); render(); }
      }, classOptions())
    ])
  ]);

  const groupStart = Math.floor(state.showCodeIndex / 5) * 5;
  const groupEnd = Math.min(groupStart + 4, students.length - 1);
  const instruction = el('div', { class: 'card stack showcode-card' }, [
    el('div', { class: 'title', text: 'Show Code – Instruction' }),
    el('p', {
      html: `Ask the following student to line up then come to you one by one:<br/>Students with ID ${students[groupStart].studentId} to ${students[groupEnd].studentId}`
    }),
    el('p', { class: 'muted', text: 'Click Next when the first student of the group is in front of you.' }),
    el('button', {
      onclick: () => { state.showCodeStage = 'credential'; state.showCodeRevealed = false; state.showCodeAwaitingNav = false; render(); }
    }, 'Next')
  ]);

  const currentStudent = students[state.showCodeIndex];
  const navControls = el('div', { class: 'h-stack' }, [
    el('button', {
      class: 'secondary',
      disabled: state.showCodeIndex === 0,
      onclick: () => { setShowCodeIndex(state.showCodeIndex - 1, students.length); render(); }
    }, 'Previous'),
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
    }, 'Next')
  ]);

  const credentialBody = state.showCodeRevealed
    ? el('div', { class: 'stack reveal-card' }, [
        el('div', { class: 'title', text: `Student ID: ${currentStudent.studentId}` }),
        el('div', { class: 'big-secret', text: currentStudent.secretId || '—' }),
        el('button', {
          onclick: () => handleShowCodeConfirm(students.length)
        }, 'Confirm and move on')
      ])
    : el('div', { class: 'stack' }, [
        el('p', { text: `Click reveal when student is ready to see the credentials for student ID: ${currentStudent.studentId}` }),
        el('button', { onclick: () => { state.showCodeRevealed = true; state.showCodeAwaitingNav = false; render(); } }, 'Reveal'),
        state.showCodeAwaitingNav && el('div', { class: 'muted', text: 'Credential hidden. Use navigation to move to the next student.' })
      ]);

  const credentialNote = state.showCodeRevealed ? null : el('div', { class: 'muted small' }, 'Use navigation to move between students.');

  const credentialCard = el('div', { class: 'card stack showcode-card' }, [
    el('div', { class: 'title', text: 'Show Code – Credential' }),
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
        el('div', { class: 'title', text: 'Individual Mode' }),
        el('p', { text: 'No data yet. Create classes and assessments in the Teacher Panel.' })
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
  }, [el('option', { value: '', text: 'Choose a class' }), ...classOptions()]);

  const assessSelect = el('select', {
    value: state.selectedAssessmentId || '',
    onchange: e => { state.selectedAssessmentId = e.target.value; state.individualRevealed = false; render(); }
  }, assessmentOptions(classObj));

  const studentOptions = (classObj?.students || []).map(s => el('option', { value: s.studentId, text: s.studentId }));
  const studentSelect = el('select', {
    value: state.individualStudentId || '',
    onchange: e => { state.individualStudentId = e.target.value; state.individualRevealed = false; render(); }
  }, [el('option', { value: '', text: 'Choose student ID' }), ...studentOptions]);

  const student = classObj?.students.find(s => s.studentId === state.individualStudentId);
  const score = assess?.scores?.[student?.studentId ?? ''];

  let body;
  if (!classObj || !assess || !student) {
    body = el('div', { class: 'notice', text: 'Select a class, assessment, and student ID to show a score.' });
  } else {
    const scoreSection = state.individualRevealed
      ? el('div', { class: 'stack' }, [
          el('div', { class: 'title', text: `Student ID ${student.studentId}` }),
          el('div', { class: 'muted', text: `Secret ID: ${student.secretId || '—'}` }),
          el('div', { class: 'big-secret', text: score === null || score === undefined ? '—' : score }),
          el('button', { class: 'secondary', onclick: () => { state.individualRevealed = false; render(); } }, 'Hide score')
        ])
      : el('div', { class: 'stack' }, [
          el('p', { text: `Verify the student's identity before revealing the score for ID ${student.studentId}.` }),
          el('button', { onclick: () => { state.individualRevealed = true; render(); } }, 'Reveal score')
        ]);

    body = el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: 'Selected student score' }),
      scoreSection
    ]);
  }

  return el('main', {}, [
    el('div', { class: 'stack' }, [
      el('div', { class: 'notice' }, 'Before revealing a score, confirm the student is who they claim to be to prevent impersonation.'),
      el('div', { class: 'card stack' }, [
        el('div', { class: 'title', text: 'Select student' }),
        el('div', { class: 'h-stack' }, [
          el('div', { style: 'min-width: 200px; flex:1;' }, [el('label', { text: 'Class' }), classSelect]),
          el('div', { style: 'min-width: 200px; flex:1;' }, [el('label', { text: 'Assessment' }), assessSelect]),
          el('div', { style: 'min-width: 180px;' }, [el('label', { text: 'Student ID' }), studentSelect])
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
  if (!classObj) return [el('option', { value: '', text: 'No assessments' })];
  const opts = classObj.assessments.map(a => el('option', { value: a.assessmentId, text: a.title, selected: state.selectedAssessmentId === a.assessmentId }));
  if (!opts.length) opts.push(el('option', { value: '', text: 'No assessments' }));
  return opts;
}

function renderCreateClassForm() {
  const nameInput = el('input', { placeholder: 'e.g. 8A' });
  const sizeInput = el('input', { type: 'number', min: '1', placeholder: 'Class size' });
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: 'Create New Class' }),
    el('div', { class: 'h-stack' }, [
      el('div', { style: 'flex:1;' }, [el('label', { text: 'Class Name' }), nameInput]),
      el('div', { style: 'width: 180px;' }, [el('label', { text: 'Class Size' }), sizeInput])
    ]),
    el('button', {
      onclick: () => {
        const name = nameInput.value.trim();
        const size = Number(sizeInput.value);
        if (!name || !size || size < 1) {
          setStatus('Enter a class name and positive size.', true);
          return;
        }
        createClass({ name, size });
        nameInput.value = '';
        sizeInput.value = '';
      }
    }, 'Create Class')
  ]);
}

function renderRosterSection(classObj) {
  if (!classObj) return el('div', { class: 'card' }, 'Select a class to manage roster.');
  const duplicates = validateSecretIds(classObj);
  const rows = classObj.students.map(s => {
    const input = el('input', {
      value: s.secretId,
      placeholder: 'Secret ID',
      oninput: e => handleSecretIdChange(classObj.classId, s.studentId, e.target.value)
    });
    const td = el('td', {}, input);
    if (duplicates.has(s.secretId) && s.secretId) td.classList.add('dup');
    return el('tr', {}, [
      el('td', {}, s.studentId),
      td,
      el('td', {}, el('button', { class: 'danger secondary', onclick: () => deleteStudent(classObj.classId, s.studentId) }, 'Delete'))
    ]);
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
      el('div', { class: 'title', text: 'Roster: Student IDs and Secret IDs' }),
      el('button', { onclick: () => applySecretIdChanges(classObj.classId) }, 'Save Secret IDs')
    ]),
    duplicates.size ? el('div', { class: 'status error', text: 'Duplicate secret IDs detected. Each secret ID must be unique.' }) : null,
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Student ID'), el('th', {}, 'Secret ID'), el('th', {}, 'Actions')])) ,
      el('tbody', {}, rows)
    ])
  ]);
}

function renderImportSection(classObj) {
  if (!classObj) return null;
  const fileInput = el('input', { type: 'file', accept: '.csv' });
  const csvModeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: 'Match by row order' }),
    el('option', { value: 'student-id', text: 'Match by studentId column' })
  ]);
  const pasteModeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: 'Match by row order' }),
    el('option', { value: 'student-id', text: 'Match by studentId column' })
  ]);
  const secretIdColInput = el('input', { type: 'number', min: '1', value: '1' });
  const studentIdColInput = el('input', { type: 'number', min: '1', value: '1' });
  const pasteArea = el('textarea', { placeholder: 'Paste cells from Sheets/Excel here...' });

  const handleRows = (rows, source, mode) => {
    if (!rows.length) return;
    const secretIdx = Number(secretIdColInput.value) - 1;
    const studentIdx = Number(studentIdColInput.value) - 1;
    applySecretIdImport(classObj.classId, rows, mode, { secretIdCol: secretIdx, studentIdCol: studentIdx });
    setStatus(`${source} import applied.`);
  };

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: 'Import Secret IDs' }),
    el('div', { class: 'small muted' }, 'Import will overwrite existing secret IDs for matching students. Duplicates are flagged before saving.'),
    el('div', { class: 'stack' }, [
      el('label', { text: 'CSV upload (Sheets/Excel export)' }),
      el('input', { type: 'file', accept: '.csv', onchange: e => { fileInput.files = e.target.files; } }),
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: 'Mode' }), csvModeSelect]),
        el('div', { style: 'width: 120px;' }, [el('label', { text: 'Secret ID column # (1-based)' }), secretIdColInput]),
        el('div', { style: 'width: 160px;' }, [el('label', { text: 'Student ID column # (for student-id mode)' }), studentIdColInput])
      ]),
      el('button', {
        onclick: () => {
          const file = fileInput.files?.[0];
          if (!file) { setStatus('Choose a CSV file first.', true); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const rows = parseCsv(reader.result);
            handleRows(rows, 'CSV', csvModeSelect.value);
          };
          reader.readAsText(file);
        }
      }, 'Upload CSV')
    ]),
    el('div', { class: 'stack' }, [
      el('label', { text: 'Copy–paste from spreadsheet' }),
      pasteArea,
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: 'Mode' }), pasteModeSelect])
      ]),
      el('button', {
        onclick: () => {
          const rows = parseCsv(pasteArea.value);
          handleRows(rows, 'Paste', pasteModeSelect.value);
          pasteArea.value = '';
        }
      }, 'Apply Pasted IDs')
    ])
  ]);
}

function renderAssessmentsSection(classObj) {
  if (!classObj) return el('div', { class: 'card' }, 'Select a class to manage assessments.');
  const titleInput = el('input', { placeholder: 'Assessment title' });
  const dateInput = el('input', { type: 'date' });
  const maxInput = el('input', { type: 'number', min: '0', placeholder: 'Max score' });

  const assessmentList = classObj.assessments.map(a => el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
    el('div', {}, [el('strong', {}, a.title), el('div', { class: 'small muted', text: `${a.date || 'No date'} • Max ${a.maxScore}` })]),
    el('div', { class: 'h-stack' }, [
      el('button', { class: state.selectedAssessmentId === a.assessmentId ? '' : 'secondary', onclick: () => { state.selectedAssessmentId = a.assessmentId; render(); } }, 'Open'),
      el('button', { class: 'danger secondary', onclick: () => deleteAssessment(classObj.classId, a.assessmentId) }, 'Delete')
    ])
  ]));

  const selected = classObj.assessments.find(a => a.assessmentId === state.selectedAssessmentId);
  let editCard = null;
  if (selected) {
    const editTitle = el('input', { value: selected.title, placeholder: 'Assessment title' });
    const editDate = el('input', { type: 'date', value: selected.date || '' });
    const editMax = el('input', { type: 'number', min: '0', value: selected.maxScore ?? '' });
    editCard = el('div', { class: 'card stack' }, [
      el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
        el('div', { class: 'title', text: `Edit ${selected.title}` }),
        el('div', { class: 'h-stack' }, [
          el('button', { class: 'secondary', onclick: () => updateAssessment(classObj.classId, selected.assessmentId, { title: editTitle.value, date: editDate.value, maxScore: Number(editMax.value) }) }, 'Save changes'),
          el('button', { class: 'danger secondary', onclick: () => deleteAssessment(classObj.classId, selected.assessmentId) }, 'Delete assessment')
        ])
      ]),
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [el('label', { text: 'Title' }), editTitle]),
        el('div', { style: 'width:160px;' }, [el('label', { text: 'Date' }), editDate]),
        el('div', { style: 'width:140px;' }, [el('label', { text: 'Max score' }), editMax])
      ])
    ]);
  }

  return el('div', { class: 'stack' }, [
    el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: 'Assessments' }),
      assessmentList.length ? el('div', { class: 'stack' }, assessmentList) : el('div', { class: 'muted' }, 'No assessments yet.'),
      el('div', { class: 'stack', style: 'border-top:1px solid var(--border); padding-top:12px;' }, [
        el('div', { class: 'title', text: 'Create new assessment' }),
        el('div', { class: 'h-stack' }, [
          el('div', { style: 'flex:1;' }, [el('label', { text: 'Title' }), titleInput]),
          el('div', { style: 'width:160px;' }, [el('label', { text: 'Date' }), dateInput]),
          el('div', { style: 'width:140px;' }, [el('label', { text: 'Max score' }), maxInput])
        ]),
        el('button', {
          onclick: () => {
            const title = titleInput.value.trim();
            const date = dateInput.value;
            const max = Number(maxInput.value);
            if (!title || Number.isNaN(max)) { setStatus('Enter title and max score.', true); return; }
            createAssessment(classObj.classId, { title, date, maxScore: max });
            titleInput.value = '';
            dateInput.value = '';
            maxInput.value = '';
          }
        }, 'Create assessment')
      ])
    ]),
    editCard
  ]);
}

function renderClassListCard() {
  if (!state.data.classes.length) return el('div', { class: 'card' }, 'No classes yet. Create one to begin.');
  const rows = state.data.classes.map(c => {
    const nameInput = el('input', { value: c.className });
    return el('tr', {}, [
      el('td', {}, nameInput),
      el('td', {}, `${c.students.length} students`),
      el('td', {}, el('div', { class: 'h-stack' }, [
        el('button', { class: state.selectedClassId === c.classId ? '' : 'secondary', onclick: () => { state.selectedClassId = c.classId; state.selectedAssessmentId = null; render(); } }, 'Open'),
        el('button', { class: 'secondary', onclick: () => updateClassName(c.classId, nameInput.value) }, 'Save name'),
        el('button', { class: 'danger secondary', onclick: () => deleteClass(c.classId) }, 'Delete class')
      ]))
    ]);
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'title', text: 'Existing classes' }),
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Class name'), el('th', {}, 'Students'), el('th', {}, 'Actions')])),
      el('tbody', {}, rows)
    ])
  ]);
}

function renderClassSelectorCard() {
  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack' }, [
      el('div', { style: 'flex:1;' }, [
        el('label', { text: 'Select class' }),
        el('select', {
          value: state.selectedClassId || '',
          onchange: e => { handleClassSelection(e.target.value); render(); }
        }, [el('option', { value: '', text: 'Choose a class' }), ...classOptions()])
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

  const pasteArea = el('textarea', { placeholder: 'Paste scores (single column for row order; or StudentID,Score for student-id mode)' });
  const modeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: 'Match by row order' }),
    el('option', { value: 'student-id', text: 'Match by student ID' })
  ]);

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
      el('div', { class: 'title', text: `Scores for ${assess.title}` }),
      el('button', { onclick: applyScoreChanges }, 'Save scores')
    ]),
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Student ID'), el('th', {}, 'Secret ID'), el('th', {}, 'Score')])),
      el('tbody', {}, rows)
    ]),
    el('div', { class: 'stack' }, [
      el('label', { text: 'Paste scores' }),
      modeSelect,
      pasteArea,
      el('button', {
        onclick: () => {
          const rows = parseCsv(pasteArea.value);
          if (!rows.length) { setStatus('Paste some rows first.', true); return; }
          applyScoreImport(classObj.classId, assess.assessmentId, rows, modeSelect.value);
          pasteArea.value = '';
        }
      }, 'Apply pasted scores')
    ])
  ]);
}

function renderTeacherPanel() {
  ensureDefaultSelections();
  const classObj = state.data.classes.find(c => c.classId === state.selectedClassId);

  const tabButtons = el('div', { class: 'tabs' }, [
    el('button', { class: state.teacherTab === 'classes' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'classes'; render(); } }, 'Class management'),
    el('button', { class: state.teacherTab === 'students' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'students'; render(); } }, 'Student IDs'),
    el('button', { class: state.teacherTab === 'assessments' ? 'tab active' : 'tab secondary', onclick: () => { state.teacherTab = 'assessments'; render(); } }, 'Assessments')
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

document.addEventListener('DOMContentLoaded', () => {
  logStep('DOM fully loaded, initial render.');
  render();
  if (window.gapi) gapiLoaded();
});
