const CLIENT_ID = '332987792434-u7r3hdl46asbqo0si3ngqu46kdbgf2at.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const DRIVE_FILE_NAME = 'maskmark-data.json';

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
  status: '',
  error: ''
};

let tokenClient = null;

const el = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'html') element.innerHTML = value;
    else element.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  });
  return element;
};

function setStatus(message, isError = false) {
  state.status = isError ? '' : message;
  state.error = isError ? message : '';
  render();
}

function gapiLoaded() {
  gapi.load('client', initGapiClient);
}

async function initGapiClient() {
  try {
    await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
    state.gapiReady = true;
    render();
  } catch (err) {
    console.error(err);
    setStatus('Failed to initialize Google API. Please refresh.', true);
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}
  });
  state.gisReady = true;
  render();
}

async function fetchUserEmail() {
  try {
    const resp = await gapi.client.request({ path: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    state.userEmail = resp.result.email || '';
  } catch (err) {
    console.error('Failed to fetch user info', err);
    state.userEmail = '';
  }
}

async function signIn() {
  if (!state.gapiReady || !state.gisReady) return;
  setStatus('');
  tokenClient.callback = async resp => {
    if (resp.error) {
      console.error(resp);
      setStatus('Sign-in failed. Please try again.', true);
      return;
    }
    try {
      gapi.client.setToken({ access_token: resp.access_token });
      state.signedIn = true;
      state.view = 'projector';
      await fetchUserEmail();
      await loadDataFromDrive();
      setStatus('Signed in.');
      render();
    } catch (err) {
      console.error(err);
      setStatus('Sign-in failed. Please try again.', true);
    }
  };
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
  render();
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
  }
}

async function loadDataFromDrive() {
  try {
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
    const dataResp = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
    state.data = dataResp.result || { classes: [] };
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
    setStatus('Saving...');
    const metadata = {
      name: DRIVE_FILE_NAME,
      parents: ['appDataFolder']
    };
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
      await gapi.client.request({
        path: `/upload/drive/v3/files/${state.dataFileId}`,
        method: 'PATCH',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
    } else {
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

function createClass({ name, size }) {
  const digits = String(size).length;
  const students = Array.from({ length: size }).map((_, idx) => {
    const num = String(idx + 1).padStart(digits, '0');
    return { studentId: `S${num}`, secretId: '' };
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

function handleSecretIdChange(classId, studentId, value) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  if (!classObj) return;
  const student = classObj.students.find(s => s.studentId === studentId);
  if (!student) return;
  student.secretId = value.trim();
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
  saveDataToDrive();
  render();
}

function handleScoreChange(classId, assessmentId, studentId, value) {
  const classObj = state.data.classes.find(c => c.classId === classId);
  const assess = classObj?.assessments.find(a => a.assessmentId === assessmentId);
  if (!assess) return;
  assess.scores[studentId] = value === '' ? null : Number(value);
  render();
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
  } else if (mode === 'secret-id') {
    rows.forEach(r => {
      const [secret, scoreRaw] = r;
      const student = classObj.students.find(s => s.secretId === secret);
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
  return el('main', {}, [
    el('div', { class: 'card stack' }, [
      el('div', { class: 'title', text: 'MaskMark – Anonymous Classroom Scores' }),
      el('p', { text: 'Sign in with Google to manage classes, secret IDs, and assessment scores. No student names are stored.' }),
      el('div', { class: 'h-stack' }, [
        el('button', { disabled: !state.gapiReady || !state.gisReady, onclick: signIn }, 'Sign in with Google'),
        (!state.gapiReady || !state.gisReady) && el('span', { class: 'muted small', text: 'Loading Google Sign-In...' })
      ]),
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
      el('button', { class: state.view === 'teacher' ? '' : 'secondary', onclick: () => { state.view = 'teacher'; render(); } }, 'Teacher Panel'),
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
  const selectors = el('div', { class: 'h-stack' }, [
    el('div', { style: 'min-width: 200px;' }, [
      el('label', { text: 'Class' }),
      el('select', {
        value: state.selectedClassId,
        onchange: e => {
          state.selectedClassId = e.target.value;
          state.selectedAssessmentId = null;
          ensureDefaultSelections();
          render();
        }
      }, classOptions())
    ]),
    el('div', { style: 'min-width: 200px;' }, [
      el('label', { text: 'Assessment' }),
      el('select', {
        value: state.selectedAssessmentId || '',
        onchange: e => { state.selectedAssessmentId = e.target.value; render(); }
      }, assessmentOptions(classObj))
    ])
  ]);

  let table;
  if (!classObj || !assess) {
    table = el('div', { class: 'notice', text: 'Select a class and assessment to display scores.' });
  } else if (!classObj.students.length) {
    table = el('div', { class: 'notice', text: 'No students in this class yet.' });
  } else {
    const rows = classObj.students.map(s => {
      const score = assess.scores[s.studentId];
      return el('tr', {}, [
        el('td', {}, s.secretId || '—'),
        el('td', {}, score === null || score === undefined ? '' : score)
      ]);
    });
    table = el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Secret ID'), el('th', {}, 'Score')])),
      el('tbody', {}, rows)
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

function classOptions() {
  return state.data.classes.map(c => el('option', { value: c.classId, text: c.className }));
}

function assessmentOptions(classObj) {
  if (!classObj) return [el('option', { value: '', text: 'No assessments' })];
  const opts = classObj.assessments.map(a => el('option', { value: a.assessmentId, text: a.title }));
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
    return el('tr', {}, [el('td', {}, s.studentId), td]);
  });

  return el('div', { class: 'card stack' }, [
    el('div', { class: 'h-stack', style: 'justify-content: space-between;' }, [
      el('div', { class: 'title', text: 'Roster: Student IDs and Secret IDs' }),
      el('button', { onclick: () => applySecretIdChanges(classObj.classId) }, 'Save Secret IDs')
    ]),
    duplicates.size ? el('div', { class: 'status error', text: 'Duplicate secret IDs detected. Each secret ID must be unique.' }) : null,
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'Student ID'), el('th', {}, 'Secret ID')])) ,
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
    el('button', { class: state.selectedAssessmentId === a.assessmentId ? '' : 'secondary', onclick: () => { state.selectedAssessmentId = a.assessmentId; render(); } }, 'Open')
  ]));

  return el('div', { class: 'card stack' }, [
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
  ]);
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

  const pasteArea = el('textarea', { placeholder: 'Paste scores (single column for row order; or SecretID,Score for secret-id mode)' });
  const modeSelect = el('select', {}, [
    el('option', { value: 'row-order', text: 'Match by row order' }),
    el('option', { value: 'secret-id', text: 'Match by secret ID' })
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
  return el('main', {}, [
    renderStatus(),
    renderCreateClassForm(),
    el('div', { class: 'card stack' }, [
      el('div', { class: 'h-stack' }, [
        el('div', { style: 'flex:1;' }, [
          el('label', { text: 'Select class' }),
          el('select', {
            value: state.selectedClassId || '',
            onchange: e => { state.selectedClassId = e.target.value; state.selectedAssessmentId = null; render(); }
          }, [el('option', { value: '', text: 'Choose a class' }), ...classOptions()])
        ])
      ])
    ]),
    renderRosterSection(classObj),
    renderImportSection(classObj),
    renderAssessmentsSection(classObj),
    renderScoresSection(classObj),
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
  app.appendChild(state.view === 'projector' ? renderProjector() : renderTeacherPanel());
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  if (window.gapi) gapiLoaded();
});
