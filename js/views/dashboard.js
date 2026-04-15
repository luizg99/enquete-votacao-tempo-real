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

export function renderDashboard(root) {
  const container = el('div');
  root.appendChild(container);

  const draw = () => {
    container.innerHTML = '';
    container.appendChild(el('h1', {}, 'Dashboard gerencial'));
    container.appendChild(el('p', { class: 'muted' }, 'Gere QR codes e acompanhe os votos de cada enquete em tempo real.'));

    const surveys = store.listSurveys();
    if (surveys.length === 0) {
      container.appendChild(el('div', { class: 'empty' }, [
        'Nenhuma enquete cadastrada ainda. ',
        el('a', { href: '#/admin' }, 'Ir para o admin'),
      ]));
      return;
    }

    surveys.forEach(s => {
      const totals = s.questions.reduce((sum, q) =>
        sum + q.answers.reduce((qs, a) => qs + (a.votes || 0), 0), 0);
      container.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('div', {}, [
            el('h2', {}, s.title || '(sem título)'),
            el('small', { class: 'muted' }, `${s.questions.length} pergunta(s) · ${totals} voto(s) registrado(s)`),
          ]),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn primary',
            onclick: () => navigate('#/qr/' + s.id),
          }, 'QR Code Votação'),
          el('button', {
            class: 'btn',
            onclick: () => navigate('#/track/' + s.id),
          }, 'Acompanhar Enquete'),
        ]),
      ]));
    });
  };

  draw();
  store.onChange(draw);
}
