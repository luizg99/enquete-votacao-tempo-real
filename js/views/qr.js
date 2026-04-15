import { store } from '../store.js';
import { navigate } from '../router.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'id') node.id = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function renderQr(root, params) {
  const survey = store.getSurvey(params.surveyId);
  if (!survey) {
    root.appendChild(el('div', { class: 'empty' }, 'Enquete não encontrada.'));
    return;
  }

  const url = `${location.origin}${location.pathname}#/vote/${survey.id}`;

  const qrDiv = el('div', { id: 'qrcode' });
  const overlay = el('div', { class: 'qr-fullscreen' }, [
    el('button', {
      class: 'btn close',
      onclick: () => navigate('#/dashboard'),
    }, '✕ Fechar'),
    el('h2', {}, survey.title || 'Enquete'),
    qrDiv,
    el('div', { class: 'url-label' }, url),
    el('p', { class: 'muted', style: 'margin-top:8px;' }, 'Aponte a câmera do celular para votar'),
  ]);
  root.appendChild(overlay);

  if (typeof QRCode !== 'undefined') {
    new QRCode(qrDiv, { text: url, width: 320, height: 320, correctLevel: QRCode.CorrectLevel.M });
  } else {
    qrDiv.appendChild(el('div', { class: 'empty' }, 'Biblioteca QRCode não carregou. Verifique a conexão.'));
  }

  return () => { overlay.remove(); };
}
