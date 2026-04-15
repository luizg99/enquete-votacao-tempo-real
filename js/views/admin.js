import { store } from '../store.js';
import { navigate } from '../router.js';

const debouncers = new Map();
function debounce(key, fn, ms = 300) {
  clearTimeout(debouncers.get(key));
  debouncers.set(key, setTimeout(fn, ms));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'oninput') node.addEventListener('input', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

let editingId = null;

export function renderAdmin(root) {
  const container = el('div');
  root.appendChild(container);

  const draw = () => {
    container.innerHTML = '';
    container.appendChild(renderHeader());
    if (editingId) {
      const survey = store.getSurvey(editingId);
      if (!survey) { editingId = null; draw(); return; }
      container.appendChild(renderEditor(survey, draw));
    }
    container.appendChild(renderList(draw));
  };

  draw();
  const onChange = () => draw();
  store.onChange(onChange);
  return () => {};
}

function renderHeader() {
  const wrap = el('div', { class: 'row', style: 'margin-bottom:18px;' }, [
    el('h1', {}, 'Administração de enquetes'),
    el('div', { class: 'spacer' }),
    el('button', {
      class: 'btn primary big',
      onclick: () => {
        const s = store.createSurvey('Nova enquete');
        editingId = s.id;
      },
    }, '+ Criar enquete'),
  ]);
  return wrap;
}

function renderEditor(survey, redraw) {
  const titleInput = el('input', {
    type: 'text',
    value: survey.title,
    placeholder: 'Descrição/título da enquete',
  });
  titleInput.addEventListener('input', () => {
    debounce('title-' + survey.id, () => store.updateSurvey(survey.id, { title: titleInput.value }));
  });

  const questionsWrap = el('div');
  survey.questions.forEach(q => questionsWrap.appendChild(renderQuestion(survey.id, q)));

  const addQuestionBtn = el('button', {
    class: 'btn',
    onclick: () => store.addQuestion(survey.id, ''),
  }, '+ Adicionar pergunta');

  const closeBtn = el('button', {
    class: 'btn ghost',
    onclick: () => { editingId = null; redraw(); },
  }, 'Fechar editor');

  return el('div', { class: 'card' }, [
    el('div', { class: 'row', style: 'margin-bottom:10px;' }, [
      el('h2', {}, 'Editando enquete'),
      el('div', { class: 'spacer' }),
      closeBtn,
    ]),
    el('label', { class: 'muted' }, 'Descrição'),
    titleInput,
    el('div', { style: 'margin-top:16px;' }, [
      el('h3', {}, 'Perguntas'),
      questionsWrap,
      el('div', { style: 'margin-top:12px;' }, addQuestionBtn),
    ]),
  ]);
}

function renderQuestion(surveyId, q) {
  const textInput = el('input', {
    type: 'text', value: q.text, placeholder: 'Texto da pergunta',
  });
  textInput.addEventListener('input', () => {
    debounce('q-' + q.id, () => store.updateQuestion(surveyId, q.id, { text: textInput.value }));
  });

  const answersWrap = el('div');
  q.answers.forEach(a => {
    const aInput = el('input', { type: 'text', value: a.text, placeholder: 'Texto da resposta' });
    aInput.addEventListener('input', () => {
      debounce('a-' + a.id, () => store.updateAnswer(surveyId, q.id, a.id, { text: aInput.value }));
    });
    answersWrap.appendChild(el('div', { class: 'answer-row' }, [
      aInput,
      el('button', {
        class: 'btn icon danger',
        title: 'Excluir resposta',
        onclick: () => store.removeAnswer(surveyId, q.id, a.id),
      }, '🗑'),
    ]));
  });

  return el('div', { class: 'question-block' }, [
    el('div', { class: 'row' }, [
      textInput,
      el('button', {
        class: 'btn danger',
        onclick: () => {
          if (confirm('Excluir esta pergunta?')) store.removeQuestion(surveyId, q.id);
        },
      }, 'Excluir pergunta'),
    ]),
    answersWrap,
    el('div', { style: 'margin-top:10px;' }, [
      el('button', {
        class: 'btn',
        onclick: () => store.addAnswer(surveyId, q.id, ''),
      }, '+ Adicionar resposta'),
    ]),
  ]);
}

function renderList(redraw) {
  const surveys = store.listSurveys();
  const card = el('div', { class: 'card' }, [ el('h2', {}, 'Enquetes cadastradas') ]);
  if (surveys.length === 0) {
    card.appendChild(el('div', { class: 'empty' }, 'Nenhuma enquete ainda. Clique em "Criar enquete" acima.'));
    return card;
  }
  surveys.forEach(s => {
    card.appendChild(el('div', { class: 'survey-list-item' }, [
      el('div', { class: 'meta' }, [
        el('strong', {}, s.title || '(sem título)'),
        el('small', {}, `${s.questions.length} pergunta(s) · criada em ${new Date(s.createdAt).toLocaleString()}`),
      ]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn',
          onclick: () => { editingId = s.id; redraw(); },
        }, 'Editar'),
        el('button', {
          class: 'btn ghost',
          onclick: () => navigate('#/dashboard'),
        }, 'Dashboard'),
        el('button', {
          class: 'btn danger',
          onclick: () => {
            if (confirm(`Excluir a enquete "${s.title}"? Votos serão perdidos.`)) {
              if (editingId === s.id) editingId = null;
              store.deleteSurvey(s.id);
            }
          },
        }, 'Excluir'),
      ]),
    ]));
  });
  return card;
}
