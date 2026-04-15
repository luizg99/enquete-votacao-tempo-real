import { store } from '../store.js';
import { navigate } from '../router.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function renderVote(root, params) {
  const survey = store.getSurvey(params.surveyId);
  const wrap = el('div', { class: 'vote-wrapper' });
  root.appendChild(wrap);

  if (!survey) {
    wrap.appendChild(el('div', { class: 'empty' }, 'Enquete não encontrada.'));
    return;
  }
  const valid = survey.questions.filter(q => q.answers.length > 0);
  if (valid.length === 0) {
    wrap.appendChild(el('div', { class: 'empty' }, 'Esta enquete ainda não possui perguntas com respostas.'));
    return;
  }

  let step = 0;
  const selections = new Map();
  let submitted = false;

  const draw = () => {
    wrap.innerHTML = '';
    if (submitted) {
      wrap.appendChild(el('div', { class: 'card', style: 'text-align:center;padding:40px;' }, [
        el('h1', {}, '✓ Obrigado!'),
        el('p', { class: 'muted' }, 'Sua resposta foi registrada.'),
      ]));
      return;
    }

    const q = valid[step];
    const progressPct = Math.round(((step + 1) / valid.length) * 100);

    wrap.appendChild(el('h1', {}, survey.title || 'Enquete'));
    wrap.appendChild(el('div', { class: 'stepper' }, `Pergunta ${step + 1} de ${valid.length}`));
    wrap.appendChild(el('div', { class: 'progress' }, [ el('div', { style: `width:${progressPct}%` }) ]));

    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, q.text || '(pergunta sem texto)'));

    q.answers.forEach(a => {
      const selectedId = selections.get(q.id);
      const isSelected = selectedId === a.id;
      const radio = el('input', { type: 'radio', name: 'q-' + q.id });
      radio.checked = isSelected;
      const label = el('label', { class: 'option' + (isSelected ? ' selected' : '') }, [
        radio, el('span', {}, a.text || '(sem texto)'),
      ]);
      label.addEventListener('click', () => {
        selections.set(q.id, a.id);
        draw();
      });
      card.appendChild(label);
    });

    const canGo = selections.has(q.id);
    const isLast = step === valid.length - 1;

    const nav = el('div', { class: 'row', style: 'margin-top:16px;' }, [
      el('button', {
        class: 'btn ghost',
        disabled: step === 0 ? 'disabled' : null,
        onclick: () => { if (step > 0) { step--; draw(); } },
      }, '← Voltar'),
      el('div', { class: 'spacer' }),
      isLast
        ? el('button', {
            class: 'btn primary',
            disabled: canGo ? null : 'disabled',
            onclick: () => {
              if (!canGo) return;
              for (const [qId, aId] of selections) {
                store.registerVote(survey.id, qId, aId);
              }
              submitted = true;
              draw();
            },
          }, 'Enviar respostas')
        : el('button', {
            class: 'btn primary',
            disabled: canGo ? null : 'disabled',
            onclick: () => { if (canGo) { step++; draw(); } },
          }, 'Próxima →'),
    ]);
    card.appendChild(nav);
    wrap.appendChild(card);

    wrap.appendChild(el('div', { style: 'text-align:center;margin-top:20px;' }, [
      el('button', { class: 'btn ghost', onclick: () => navigate('#/dashboard') }, 'Ir ao dashboard'),
    ]));
  };

  draw();
}
