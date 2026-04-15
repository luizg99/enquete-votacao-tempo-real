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

export function renderTrack(root, params) {
  const surveyId = params.surveyId;
  const container = el('div');
  root.appendChild(container);

  let lastUpdate = Date.now();

  const draw = () => {
    const survey = store.getSurvey(surveyId);
    if (!survey) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, 'Enquete não encontrada.'));
      return;
    }

    const tally = store.tally(surveyId) || [];
    const participants = store.totalParticipantsFor(surveyId);
    const secondsAgo = Math.round((Date.now() - lastUpdate) / 1000);

    container.innerHTML = '';

    container.appendChild(el('div', { class: 'row', style: 'margin-bottom:12px;' }, [
      el('div', {}, [
        el('h1', {}, survey.title || 'Enquete'),
        el('small', { class: 'muted' }, `Atualizado há ${secondsAgo}s · polling a cada 1s`),
      ]),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', onclick: () => navigate('#/dashboard') }, '← Dashboard'),
      el('button', { class: 'btn primary', onclick: () => navigate('#/qr/' + surveyId) }, 'QR Code'),
    ]));

    container.appendChild(el('div', { class: 'stats-bar' }, [
      el('div', { class: 'stat' }, [
        el('span', { class: 'value' }, String(participants)),
        el('span', { class: 'label' }, 'Participantes (máx. por pergunta)'),
      ]),
      el('div', { class: 'stat' }, [
        el('span', { class: 'value' }, String(survey.questions.length)),
        el('span', { class: 'label' }, 'Perguntas'),
      ]),
    ]));

    if (tally.length === 0) {
      container.appendChild(el('div', { class: 'empty' }, 'Esta enquete ainda não possui perguntas.'));
      return;
    }

    tally.forEach((q, idx) => {
      const card = el('div', { class: 'card track-question' });
      card.appendChild(el('h2', {}, `${idx + 1}. ${q.text || '(sem texto)'}`));
      card.appendChild(el('small', { class: 'muted' }, `Total de votos: ${q.total}`));

      if (q.answers.length === 0) {
        card.appendChild(el('div', { class: 'empty', style: 'padding:20px;margin-top:10px;' }, 'Sem respostas configuradas.'));
      } else {
        const bars = el('div', { style: 'margin-top:14px;' });
        q.answers.forEach(a => {
          bars.appendChild(el('div', { class: 'bar-row' }, [
            el('div', { class: 'label' }, a.text || '(sem texto)'),
            el('div', { class: 'bar' }, [ el('div', { style: `width:${a.pct}%` }) ]),
            el('div', { class: 'count' }, `${a.votes} voto(s) · ${a.pct}%`),
          ]));
        });
        card.appendChild(bars);
      }
      container.appendChild(card);
    });
  };

  const onStore = () => { lastUpdate = Date.now(); draw(); };
  draw();

  const interval = setInterval(draw, 1000);
  const onStorage = (e) => { if (e.key === 'taskq:v1') onStore(); };
  const onChanged = () => onStore();
  window.addEventListener('storage', onStorage);
  window.addEventListener('taskq:changed', onChanged);

  return () => {
    clearInterval(interval);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('taskq:changed', onChanged);
  };
}
