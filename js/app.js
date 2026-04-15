import { register, start } from './router.js';
import { renderAdmin } from './views/admin.js';
import { renderVote } from './views/vote.js';
import { renderDashboard } from './views/dashboard.js';
import { renderQr } from './views/qr.js';
import { renderTrack } from './views/track.js';

register('/admin', renderAdmin);
register('/dashboard', renderDashboard);
register('/vote/:surveyId', renderVote);
register('/qr/:surveyId', renderQr);
register('/track/:surveyId', renderTrack);
register('/', renderAdmin);

const root = document.getElementById('app');
start(root);
