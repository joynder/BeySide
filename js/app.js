/**
 * Main Application Logic for BeySide
 * Handles Light Theme Default, Monochrome Accents, Canvas 4:5 Poster Text Wrapping,
 * Logged-out Team Enrollment CTA Redirects, Player Nickname Prominence & Winner Selection Buttons.
 */

document.addEventListener('DOMContentLoaded', () => {
  window.storageManager.initSynchronous();

  // Preload all embedded cover images into memory so poster drawing is always synchronous
  preloadAllCovers();

  initThemeToggle();
  initNavigation();
  initModals();
  initTeamForms();
  initEventForm();
  initClubForm();
  initClubRequestForm();

  handleHashRouting();
  window.addEventListener('hashchange', handleHashRouting);

  setupFilters();

  // The server is the shared source of truth. Existing local browser data is
  // migrated only when the shared data folder is still empty.
  window.addEventListener('storage-manager-updated', refreshSharedDataView);
  window.storageManager.startSharedSync();
});

function refreshSharedDataView() {
  // Do not replace text while someone is filling in a form.
  const activeElement = document.activeElement;
  if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) return;

  const hash = window.location.hash || '';
  if (hash.startsWith('#torneo-detail')) {
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const eventId = params.get('id');
    if (eventId) {
      const evt = window.storageManager.getEventById(eventId);
      if (evt) {
        renderSwissMatchesOnDetailPage(evt);
        return;
      }
    }
  }

  handleHashRouting();
}

/* ==========================================================================
   1. THEME TOGGLE (DEFAULT LIGHT MODE)
   ========================================================================== */
function initThemeToggle() {
  const themeBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('beyside_theme_v6') || 'light';

  setTheme(savedTheme);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('beyside_theme_v6', theme);

  const themeLabel = document.getElementById('themeLabel');
  if (themeLabel) {
    themeLabel.textContent = theme === 'light' ? '[GIORNO]' : '[NOTTE]';
  }
}

/* ==========================================================================
   2. HASH ROUTER (DEFAULT: EVENTI)
   ========================================================================== */
function handleHashRouting() {
  const hash = window.location.hash || '#eventi';
  const [tabPart, paramPart] = hash.substring(1).split('?');
  
  if (tabPart.startsWith('torneo-detail')) {
    const params = new URLSearchParams(paramPart || '');
    const eventId = params.get('id');
    if (eventId) {
      showTournamentDetailView(eventId);
      return;
    }
  }

  const validTabs = ['eventi', 'classifica', 'area-team', 'gestionale'];
  const targetTab = validTabs.includes(tabPart) ? tabPart : 'eventi';

  activateTabUI(targetTab);
}

function activateTabUI(tabName) {
  const navLinks = document.querySelectorAll('.nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const navLinksContainer = document.getElementById('navLinks');

  navLinks.forEach(link => {
    if (link.getAttribute('data-tab') === tabName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.id === tabName + 'Tab') {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  if (navLinksContainer) navLinksContainer.classList.remove('active');

  if (tabName === 'eventi') renderEvents();
  if (tabName === 'classifica') renderClassifica();
  if (tabName === 'area-team') renderTeamAccountArea();
  if (tabName === 'gestionale') renderAdminView();
}

function navigateToTab(tabName) {
  window.location.hash = '#' + tabName;
}

function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute('data-tab');
      if (targetTab) {
        navigateToTab(targetTab);
      }
    });
  });
}

/* ==========================================================================
   3. TEAM ACCOUNT PORTAL (CAPTAIN DASHBOARD)
   ========================================================================== */
function initTeamForms() {
  const loginForm = document.getElementById('teamLoginForm');
  const registerForm = document.getElementById('teamRegisterForm');
  const updateRosterForm = document.getElementById('updateRosterForm');

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmailInput').value.trim();
      const password = document.getElementById('loginPasswordInput').value;

      const res = window.storageManager.loginTeamAccount(email, password);
      if (res.success) {
        showToast(`Benvenuto capitano di ${res.team.name}!`, 'success');
        renderTeamAccountArea();
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('regEmailInput').value.trim();
      const password = document.getElementById('regPasswordInput').value;
      const teamName = document.getElementById('regTeamNameInput').value.trim();
      const tag = document.getElementById('regTagInput').value.trim();
      const captain = document.getElementById('regCaptainInput').value.trim();
      const city = document.getElementById('regCityInput').value.trim();
      const iconUrl = document.getElementById('regIconInput')?.value.trim();

      const res = window.storageManager.registerTeamAccount({
        email, password, teamName, tag, captain, city, iconUrl
      });

      if (res.success) {
        showToast(res.message, 'success');
        renderTeamAccountArea();
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  if (updateRosterForm) {
    updateRosterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveCaptainDashboardRoster();
    });
  }
}

function renderTeamAccountArea() {
  const authContainer = document.getElementById('teamAuthContainer');
  const dashboardContainer = document.getElementById('teamDashboardContainer');
  const currentTeam = window.storageManager.getCurrentUserTeam();

  if (!currentTeam) {
    if (authContainer) authContainer.style.display = 'grid';
    if (dashboardContainer) dashboardContainer.style.display = 'none';
  } else {
    if (authContainer) authContainer.style.display = 'none';
    if (dashboardContainer) {
      dashboardContainer.style.display = 'block';
      renderCaptainDashboard(currentTeam);
    }
  }
}

function renderCaptainDashboard(team) {
  document.getElementById('dashTeamName').textContent = team.name;
  document.getElementById('dashTeamTag').textContent = `[${team.tag}]`;
  document.getElementById('dashCaptainName').textContent = team.captain;
  document.getElementById('dashTeamCity').textContent = team.city ? `Città: ${team.city}` : '';
  
  const iconBox = document.getElementById('dashAvatarBox');
  if (iconBox) {
    if (team.iconUrl && (team.iconUrl.startsWith('http://') || team.iconUrl.startsWith('https://') || team.iconUrl.startsWith('data:'))) {
      iconBox.innerHTML = `<img src="${escapeHtml(team.iconUrl)}" alt="Logo">`;
    } else {
      iconBox.textContent = team.iconUrl || team.tag.substring(0, 1);
    }
  }

  const iconInput = document.getElementById('dashIconInput');
  if (iconInput) iconInput.value = team.iconUrl || '';

  const cityInput = document.getElementById('dashCityInput');
  if (cityInput) cityInput.value = team.city || '';

  const rosterContainer = document.getElementById('dashRosterEditor');
  if (!rosterContainer) return;

  const players = team.players || [];
  let html = '';

  for (let i = 0; i < 4; i++) {
    const p = players[i] || { name: '', nickname: '' };
    const isRequired = i < 3;

    html += `
      <div class="player-row-card">
        <div class="player-row-header">
          <span>GIOCATORE #${i+1} ${isRequired ? '(OBBLIGATORIO)' : '(OPZIONALE)'} ${i === 0 ? '- [CAPITANO]' : ''}</span>
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0.4rem;">
            <label class="form-label">Nickname / Gamertag ${isRequired ? '*' : ''}</label>
            <input type="text" class="form-control dash-player-nick" value="${escapeHtml(p.nickname || p.name)}" placeholder="Nickname" ${isRequired ? 'required' : ''}>
          </div>
          <div class="form-group" style="margin-bottom:0.4rem;">
            <label class="form-label">Nome & Cognome</label>
            <input type="text" class="form-control dash-player-name" value="${escapeHtml(p.name)}" placeholder="Nome e Cognome">
          </div>
        </div>
      </div>
    `;
  }

  rosterContainer.innerHTML = html;
}

function saveCaptainDashboardRoster() {
  const currentTeam = window.storageManager.getCurrentUserTeam();
  if (!currentTeam) return;

  const iconUrl = document.getElementById('dashIconInput')?.value.trim();
  const city = document.getElementById('dashCityInput')?.value.trim();
  const names = document.querySelectorAll('.dash-player-name');
  const nicks = document.querySelectorAll('.dash-player-nick');

  const players = [];
  nicks.forEach((input, idx) => {
    const nickVal = input.value.trim();
    const nameVal = names[idx]?.value.trim() || '';
    if (nickVal || nameVal) {
      players.push({
        nickname: nickVal || nameVal,
        name: nameVal || nickVal
      });
    }
  });

  if (players.length < 3) {
    showToast('La squadra deve contenere almeno 3 giocatori validi!', 'error');
    return;
  }

  // Cap at 4 players max
  if (players.length > 4) {
    players.length = 4;
  }

  // Player #1 is always the captain
  const captain = players[0]?.name || players[0]?.nickname || currentTeam.captain;

  window.storageManager.updateTeamProfile(currentTeam.id, { players, iconUrl, city, captain });
  showToast('Profilo, Roster ed Icona aggiornati con successo.', 'success');
  renderTeamAccountArea();
  renderClassifica();
}

function deleteCurrentTeamAccount() {
  const currentTeam = window.storageManager.getCurrentUserTeam();
  if (!currentTeam) return;

  if (confirm(`Sei sicuro di voler eliminare la squadra "${currentTeam.name}" ed il relativo account? L'azione è irreversibile.`)) {
    window.storageManager.deleteTeam(currentTeam.id);
    showToast('Squadra ed account eliminati.', 'success');
    renderTeamAccountArea();
    renderClassifica();
    renderEvents();
  }
}

function logoutCaptain() {
  window.storageManager.logoutTeamAccount();
  showToast('Logout effettuato.', 'info');
  renderTeamAccountArea();
}

/* ==========================================================================
   4. RENDER EVENTS & DEDICATED TOURNAMENT VIEW
   ========================================================================== */
function renderEvents() {
  const container = document.getElementById('eventsGrid');
  if (!container) return;

  const events = window.storageManager.getEvents();
  const searchVal = (document.getElementById('eventSearchInput')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('eventStatusFilter')?.value || 'all';

  const filteredEvents = events.filter(evt => {
    const matchesSearch = (evt.title || '').toLowerCase().includes(searchVal) ||
                          (evt.location || '').toLowerCase().includes(searchVal) ||
                          (evt.venue || '').toLowerCase().includes(searchVal) ||
                          (evt.organizingClub || '').toLowerCase().includes(searchVal);
    const matchesStatus = statusFilter === 'all' || evt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (filteredEvents.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>Nessun Torneo Trovato</h3>
        <p>Non ci sono tornei disponibili per la ricerca effettuata.</p>
      </div>
    `;
    return;
  }

  const loggedTeam = window.storageManager.getCurrentUserTeam();

  container.innerHTML = filteredEvents.map(evt => {
    const registeredCount = (evt.registeredTeamIds || []).length;
    const isFull = registeredCount >= evt.maxTeams;
    const isEnrolled = loggedTeam && (evt.registeredTeamIds || []).includes(loggedTeam.id);
    const progressPercent = Math.min(100, Math.round((registeredCount / evt.maxTeams) * 100));

    let statusClass = evt.status === 'concluso' ? 'concluso' : (evt.status === 'in_corso' ? 'in_corso' : 'aperto');
    let statusLabel = 'APERTO';
    if (evt.status === 'in_corso') statusLabel = 'IN CORSO';
    else if (evt.status === 'concluso') statusLabel = 'CONCLUSO';
    else if (isFull) statusLabel = 'SOLD OUT';

    return `
      <div class="event-card" onclick="openTournamentDetailPage('${evt.id}')">
        <div>
          <div class="event-card-header">
            <h3 class="event-card-title">${escapeHtml(evt.title)}</h3>
            <span class="status-badge ${statusClass}">[${statusLabel}]</span>
          </div>

          <div class="event-meta-list">
            <div><strong>Organizzato da:</strong> ${escapeHtml(evt.organizingClub || 'BeySide Club')}</div>
            <div><strong>Data:</strong> ${formatDate(evt.date)} ore ${escapeHtml(evt.time || '')}</div>
            <div><strong>Luogo:</strong> ${escapeHtml(evt.venue || '')}</div>
            <div><strong>Formato:</strong> 3v3 Round Robin</div>
            ${isEnrolled ? `<div style="font-weight:800; color:var(--text-main); margin-top:0.25rem;">[LA TUA SQUADRA E' ISCRITTA]</div>` : ''}
          </div>
        </div>

        <div>
          <div class="event-teams-counter">
            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted);">
              SQUADRE ISCRITTE
            </span>
            <span style="font-size: 0.85rem; font-weight: 800;">
              ${registeredCount} / ${evt.maxTeams}
            </span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>

          <div style="margin-top: 1rem; display: flex; justify-content: flex-end;">
            <span class="btn btn-secondary btn-sm">Apri Pagina Torneo</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openTournamentDetailPage(eventId) {
  window.location.hash = `#torneo-detail?id=${eventId}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showTournamentDetailView(eventId, shouldScroll = false) {
  const evt = window.storageManager.getEventById(eventId);
  if (!evt) {
    navigateToTab('eventi');
    return;
  }

  // Keep the exact event associated with the poster and its download button.
  window.currentDetailEvent = evt;
  const posterDownloadButton = document.querySelector('.poster-download-btn-overlay');
  if (posterDownloadButton) posterDownloadButton.dataset.eventId = evt.id;

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const detailPane = document.getElementById('torneoDetailView');
  if (detailPane) detailPane.classList.add('active');

  const statusClass = evt.status === 'concluso' ? 'concluso' : 'aperto';

  document.getElementById('detailTitle').textContent = evt.title;
  document.getElementById('detailMeta').innerHTML = `
    <div><strong>Club Organizzatore:</strong> ${escapeHtml(evt.organizingClub || 'BeySide Club')}</div>
    <div><strong>Data & Ora:</strong> ${formatDate(evt.date)} ore ${escapeHtml(evt.time || '10:00')}</div>
    <div><strong>Luogo / Venue:</strong> ${escapeHtml(evt.venue || '')} ${evt.location ? `(${escapeHtml(evt.location)})` : ''}</div>
    <div><strong>Quota Iscrizione:</strong> € ${escapeHtml(evt.fee || '15')}</div>
    <div><strong>Formato:</strong> 3v3 Round Robin</div>
    <div><strong>Stato:</strong> <span class="status-badge ${statusClass}">[${(evt.status || 'aperto').toUpperCase()}]</span></div>
  `;
  document.getElementById('detailDescription').textContent = evt.description || '';

  // Setup Quick Enroll / Drop CTA
  const loggedTeam = window.storageManager.getCurrentUserTeam();
  const isEnrolled = loggedTeam && (evt.registeredTeamIds || []).includes(loggedTeam.id);
  const isFull = (evt.registeredTeamIds || []).length >= evt.maxTeams;

  const enrollBtn = document.getElementById('detailEnrollBtn');
  const dropBtn = document.getElementById('detailDropBtn');

  if (enrollBtn && dropBtn) {
    if (isEnrolled) {
      enrollBtn.style.display = 'none';
      dropBtn.style.display = 'inline-flex';
      dropBtn.onclick = () => quickDropTeam(evt.id, loggedTeam.id);
    } else {
      dropBtn.style.display = 'none';
      enrollBtn.style.display = 'inline-flex';

      if (!loggedTeam) {
        enrollBtn.disabled = false;
        enrollBtn.style.opacity = '1';
        enrollBtn.textContent = 'Accedi come squadra per iscriverti';
        enrollBtn.onclick = () => navigateToTab('area-team');
      } else if (evt.status !== 'aperto' || isFull) {
        enrollBtn.disabled = true;
        enrollBtn.style.opacity = '0.4';
        enrollBtn.textContent = isFull ? 'Posti Esauriti' : 'Iscrizioni Chiuse';
      } else {
        enrollBtn.disabled = false;
        enrollBtn.style.opacity = '1';
        enrollBtn.textContent = `Iscrivi ${loggedTeam.name}`;
        enrollBtn.onclick = () => quickEnrollTeam(evt.id, loggedTeam.id);
      }
    }
  }

  // Render Enrolled Teams List with Nickname Prominence
  const enrolledTeams = (evt.registeredTeamIds || []).map(id => window.storageManager.getTeamById(id)).filter(Boolean);
  const enrolledContainer = document.getElementById('detailEnrolledTeamsContainer');
  
  if (enrolledContainer) {
    if (enrolledTeams.length === 0) {
      enrolledContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">Nessuna squadra ancora iscritta.</p>`;
    } else {
      enrolledContainer.innerHTML = enrolledTeams.map((team, idx) => `
        <div style="background-color:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-between; align-items:center; margin-bottom:0.35rem;">
            <div style="font-weight:800; font-size:0.95rem;">
              #${idx+1} ${escapeHtml(team.name)} <span style="font-size:0.75rem; color:var(--text-muted);">[${escapeHtml(team.tag)}]</span>
            </div>
            <span style="font-size:0.75rem; font-weight:700;">Capitano: ${escapeHtml(team.captain)}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.35rem;">
            ROSTER GIOCATORI (${team.players.length}/4):
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
            ${(team.players || []).map(p => `
              <span style="background-color:var(--bg-card); border:1px solid var(--border-color); padding:0.2rem 0.6rem; border-radius:var(--radius-full); font-size:0.75rem;">
                <strong class="player-nick-bold">${escapeHtml(p.nickname || p.name)}</strong> ${p.nickname ? `<span class="player-name-sub">(${escapeHtml(p.name)})</span>` : ''}
              </span>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  }

  // Draw 4:5 Poster (Text Wrap & Overflow Fix)
  drawIMLStylePoster(evt);

  // Render Live Round Robin Matches
  renderSwissMatchesOnDetailPage(evt);

  if (shouldScroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function quickEnrollTeam(eventId, teamId) {
  const res = window.storageManager.registerTeamToEvent(eventId, teamId);
  if (res.success) {
    showToast(res.message, 'success');
    showTournamentDetailView(eventId);
    renderEvents();
  } else {
    showToast(res.message, 'error');
  }
}

function quickDropTeam(eventId, teamId) {
  if (confirm("Vuoi ritirare la tua squadra da questo torneo?")) {
    window.storageManager.unregisterTeamFromEvent(eventId, teamId);
    showToast("La tua squadra si è ritirata dal torneo.", "info");
    showTournamentDetailView(eventId);
    renderEvents();
  }
}

/* ==========================================================================
   5. LIVE ROUND ROBIN MATCHES (CLEAN WINNER BUTTONS, NO SCROLL JUMP)
   ========================================================================== */
function renderSwissMatchesOnDetailPage(evt) {
  const container = document.getElementById('detailSwissContainer');
  if (!container) return;

  const rounds = evt.swissRounds || [];
  const isConcluded = evt.status === 'concluso';
  const totalMaxRounds = window.storageManager.getTotalRoundRobinRounds(evt.id);

  const currentRoundNum = rounds.length;
  const isLastRoundReached = currentRoundNum >= totalMaxRounds && totalMaxRounds > 0;

  const session = window.storageManager.getCurrentAdminSession();
  const canManage = session && (
    session.role === 'admin' ||
    (session.role === 'club_leader' && session.clubName && session.clubName.trim().toLowerCase() === (evt.organizingClub || '').trim().toLowerCase())
  );

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
      <h3 style="font-size: 1.1rem; text-transform: uppercase;">
        Tabellone Round Robin (${totalMaxRounds > 0 ? `Turni totali previsti: ${totalMaxRounds}` : ''})
      </h3>
      ${!isConcluded && canManage ? `
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          ${rounds.length === 0 ? `
            <button class="btn btn-primary btn-sm" onclick="startSwissOnDetailPage('${evt.id}', event)">
              Avvia Torneo
            </button>
          ` : `
            ${!isLastRoundReached ? `
              <button class="btn btn-secondary btn-sm" onclick="generateNextSwissRoundOnDetailPage('${evt.id}', event)">
                Prossimo Turno (${currentRoundNum + 1}/${totalMaxRounds})
              </button>
            ` : ''}
            <button class="btn btn-primary btn-sm" onclick="concludeTournamentAction('${evt.id}', event)">
              Concludi Torneo
            </button>
          `}
        </div>
      ` : (isConcluded ? `<span class="status-badge concluso">[TORNEO CONCLUSO]</span>` : '')}
    </div>
  `;

  if (rounds.length === 0 && !isConcluded) {
    html += `
      <div class="empty-state">
        <p>Il torneo non è ancora stato avviato.${canManage ? ' Clicca su "Avvia Torneo" per generare le sfide.' : ' In attesa che il Club Organizzatore avvii le sfide.'}</p>
      </div>
    `;
  } else {
    rounds.forEach(r => {
      html += `
        <div class="swiss-round-card">
          <div class="swiss-round-header">TURNO ${r.roundNumber} DI ${totalMaxRounds} ${r.isCompleted ? '(COMPLETATO)' : '(IN CORSO)'}</div>
          ${r.matches.map((m, idx) => {
            const isTeam1Retired = (evt.retiredTeamIds || []).includes(m.team1Id) || (!window.storageManager.getTeamById(m.team1Id) && m.team1Id !== 'BYE');
            const isTeam2Retired = (evt.retiredTeamIds || []).includes(m.team2Id) || (!window.storageManager.getTeamById(m.team2Id) && m.team2Id !== 'BYE');

            const team1Label = `${escapeHtml(m.team1Name)}${isTeam1Retired ? ' <span style="color:#ef4444; font-weight:700;">(RITIRATA)</span>' : ''}`;
            const team2Label = `${escapeHtml(m.team2Name)}${isTeam2Retired ? ' <span style="color:#ef4444; font-weight:700;">(RITIRATA)</span>' : ''}`;

            let winnerDisplay = 'Non registrato';
            if (m.winnerId === m.team1Id) winnerDisplay = team1Label;
            else if (m.winnerId === m.team2Id) winnerDisplay = team2Label;

            return `
              <div class="swiss-match-item">
                <span class="swiss-teams-vs">${team1Label} VS ${team2Label}</span>
                <div>
                  ${m.team2Id === 'BYE' ? `<strong>Vittoria Automatica (BYE)</strong>` : (isConcluded || !canManage ? `
                    <strong>Vincitore: ${winnerDisplay}</strong>
                  ` : `
                    <button class="btn btn-sm ${m.winnerId === m.team1Id ? 'btn-primary' : 'btn-secondary'}" onclick="setSwissWinnerOnDetailPage('${evt.id}', ${r.roundNumber}, ${idx}, '${m.team1Id}', event)">
                      ${team1Label}
                    </button>
                    <button class="btn btn-sm ${m.winnerId === m.team2Id ? 'btn-primary' : 'btn-secondary'}" onclick="setSwissWinnerOnDetailPage('${evt.id}', ${r.roundNumber}, ${idx}, '${m.team2Id}', event)">
                      ${team2Label}
                    </button>
                  `)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    });
  }

  if (isConcluded) {
    const teams = (evt.registeredTeamIds || []).map(id => window.storageManager.getTeamById(id)).filter(Boolean);
    teams.sort((a, b) => (b.points || 0) - (a.points || 0));

    html += `
      <div style="margin-top:1.5rem; background-color:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem;">
        <h4 style="font-size:1rem; text-transform:uppercase; margin-bottom:0.75rem; border-bottom:1px solid var(--border-color); padding-bottom:0.3rem;">
          Classifica Finale del Torneo
        </h4>
        <ul style="list-style:none; display:flex; flex-direction:column; gap:0.4rem;">
          ${teams.map((t, i) => `
            <li style="display:flex; justify-between; font-size:0.85rem; padding:0.3rem 0.5rem; background-color:var(--bg-card); border-radius:var(--radius-sm);">
              <span><strong>#${i+1} ${escapeHtml(t.name)}</strong> [${escapeHtml(t.tag)}]</span>
              <span><strong>${t.points || 0} Punti Totali</strong></span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  container.innerHTML = html;
}

function startSwissOnDetailPage(eventId, e) {
  if (e) e.preventDefault();
  const res = window.storageManager.startSwissTournament(eventId);
  if (res.success) {
    showToast(res.message, 'success');
    const evt = window.storageManager.getEventById(eventId);
    renderSwissMatchesOnDetailPage(evt);
  } else {
    showToast(res.message, 'error');
  }
}

function generateNextSwissRoundOnDetailPage(eventId, e) {
  if (e) e.preventDefault();
  const res = window.storageManager.generateNextSwissRound(eventId);
  if (res.success) {
    showToast(res.message, 'success');
    const evt = window.storageManager.getEventById(eventId);
    renderSwissMatchesOnDetailPage(evt);
  } else {
    showToast(res.message, 'error');
  }
}

function setSwissWinnerOnDetailPage(eventId, roundNum, matchIdx, winnerId, e) {
  if (e) e.preventDefault();
  window.storageManager.recordMatchWinner(eventId, roundNum, matchIdx, winnerId);
  const evt = window.storageManager.getEventById(eventId);
  renderSwissMatchesOnDetailPage(evt);
}

function concludeTournamentAction(eventId, e) {
  if (e) e.preventDefault();
  if (confirm("Sei sicuro di voler concludere il torneo? I risultati verranno accreditati nella classifica ufficiale.")) {
    const res = window.storageManager.concludeTournament(eventId);
    if (res.success) {
      showToast(res.message, 'success');
      showTournamentDetailView(eventId);
      renderClassifica();
      renderEvents();
      renderAdminTable();
    } else {
      showToast(res.message, 'error');
    }
  }
}

function getMangaCoverDataUri(volIdx) {
  const configs = [
    { vol: '1', blade: '#2563eb', accent: '#74c400', kanji: 'ベイブレードX 第1巻', bey: 'DRAN SWORD' },
    { vol: '2', blade: '#dc2626', accent: '#ff5500', kanji: 'ベイブレードX 第2巻', bey: 'HELLS SCYTHE' },
    { vol: '3', blade: '#7e22ce', accent: '#74c400', kanji: 'ベイブレードX 第3巻', bey: 'WIZARD ARROW' },
    { vol: '4', blade: '#0284c7', accent: '#38bdf8', kanji: 'ベイブレードX 第4巻', bey: 'DRAN DAGGER' }
  ];
  const c = configs[volIdx % configs.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550" viewBox="0 0 800 550">
    <defs>
      <linearGradient id="bgGrad${volIdx}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#09090b"/>
        <stop offset="50%" stop-color="#18181b"/>
        <stop offset="100%" stop-color="#000000"/>
      </linearGradient>
      <linearGradient id="bladeGrad${volIdx}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.blade}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <pattern id="mangaDots${volIdx}" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="2.5" fill="rgba(255,255,255,0.08)"/>
        <circle cx="12" cy="12" r="2.5" fill="rgba(255,255,255,0.08)"/>
      </pattern>
    </defs>
    
    <rect width="800" height="550" fill="url(#bgGrad${volIdx})"/>
    <rect width="800" height="550" fill="url(#mangaDots${volIdx})"/>
    
    <!-- Manga Radial Speed Burst Lines -->
    <g stroke="rgba(255,255,255,0.18)" stroke-width="2">
      <line x1="400" y1="220" x2="0" y2="0"/>
      <line x1="400" y1="220" x2="200" y2="0"/>
      <line x1="400" y1="220" x2="400" y2="0"/>
      <line x1="400" y1="220" x2="600" y2="0"/>
      <line x1="400" y1="220" x2="800" y2="0"/>
      <line x1="400" y1="220" x2="800" y2="200"/>
      <line x1="400" y1="220" x2="800" y2="400"/>
      <line x1="400" y1="220" x2="800" y2="550"/>
      <line x1="400" y1="220" x2="600" y2="550"/>
      <line x1="400" y1="220" x2="400" y2="550"/>
      <line x1="400" y1="220" x2="200" y2="550"/>
      <line x1="400" y1="220" x2="0" y2="550"/>
      <line x1="400" y1="220" x2="0" y2="350"/>
      <line x1="400" y1="220" x2="0" y2="150"/>
    </g>
    
    <!-- Manga Action Gear Blade Art -->
    <g transform="translate(400,220) rotate(20)">
      <circle r="150" fill="none" stroke="${c.accent}" stroke-width="5" stroke-dasharray="16 8" opacity="0.85"/>
      <circle r="120" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 6" opacity="0.7"/>
      <!-- Gear Blade Blades -->
      <path d="M 0 -140 L 40 -75 L -30 -75 Z M 121 -70 L 75 40 L 55 -30 Z M 121 70 L 30 75 L 70 -40 Z M 0 140 L -40 75 L 30 75 Z M -121 70 L -75 -40 L -55 30 Z M -121 -70 L -30 -75 L -70 40 Z" fill="url(#bladeGrad${volIdx})" stroke="${c.accent}" stroke-width="4"/>
      <!-- Core Emblem -->
      <circle r="50" fill="#09090b" stroke="#ffffff" stroke-width="4"/>
      <text x="0" y="14" font-family="Inter, sans-serif" font-weight="900" font-size="38" fill="${c.accent}" text-anchor="middle">X</text>
    </g>

    <!-- Official Manga Volume Header Badge -->
    <rect x="35" y="35" width="260" height="44" fill="#000000" stroke="${c.accent}" stroke-width="3" rx="8"/>
    <text x="50" y="63" font-family="Inter, sans-serif" font-weight="900" font-size="16" fill="#ffffff" letter-spacing="1">BEYBLADE X MANGA VOL.${c.vol}</text>
    
    <text x="765" y="65" font-family="sans-serif" font-weight="900" font-size="26" fill="${c.accent}" text-anchor="end">${c.kanji}</text>
    <text x="400" y="470" font-family="Inter, sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" letter-spacing="4">${c.bey}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}


// EMBEDDED_COVERS is loaded from js/covers.js — Base64 Data URI PNGs, never taints canvas
const LOCAL_MANGA_COVERS = (typeof EMBEDDED_COVERS !== 'undefined' ? EMBEDDED_COVERS : []).filter(Boolean);

const loadedLocalImages = {};

// Get a cover Image object by logical index.
// EMBEDDED_COVERS are already Base64 Data URIs — create Image() once and cache.
function getCoverImageByIndex(idx, callback) {
  const normalIdx = ((idx % LOCAL_MANGA_COVERS.length) + LOCAL_MANGA_COVERS.length) % LOCAL_MANGA_COVERS.length;
  const cacheKey = 'embedded_' + normalIdx;
  if (loadedLocalImages[cacheKey]) {
    callback(loadedLocalImages[cacheKey]);
    return;
  }
  const dataUri = LOCAL_MANGA_COVERS[normalIdx];
  if (!dataUri) { callback(null); return; }
  const img = new Image();
  img.onload = () => { loadedLocalImages[cacheKey] = img; callback(img); };
  img.onerror = () => callback(null);
  img.src = dataUri;
}

// Get a cover by URL key (used by events that store coverImage as 'img/coverN.png').
// Maps the filename to the embedded array by index.
function getLocalCoverImage(url, callback) {
  // Extract index from filename: cover1.png → 0, cover2.png → 1, etc.
  const match = (url || '').match(/cover(\d+)\./i);
  const idx = match ? parseInt(match[1], 10) - 1 : Math.abs(hashString(url)) % Math.max(LOCAL_MANGA_COVERS.length, 1);
  getCoverImageByIndex(idx, callback);
}

// Preload all embedded covers on startup so drawIMLStylePosterOnContext is always synchronous.
function preloadAllCovers() {
  for (let i = 0; i < LOCAL_MANGA_COVERS.length; i++) {
    getCoverImageByIndex(i, () => {});
  }
}

// Resolve the cache key for a given coverImage URL (mirrors getLocalCoverImage logic).
function coverCacheKey(url) {
  const match = (url || '').match(/cover(\d+)\./i);
  const idx = match ? parseInt(match[1], 10) - 1 : Math.abs(hashString(url)) % Math.max(LOCAL_MANGA_COVERS.length, 1);
  const normalIdx = ((idx % Math.max(LOCAL_MANGA_COVERS.length, 1)) + Math.max(LOCAL_MANGA_COVERS.length, 1)) % Math.max(LOCAL_MANGA_COVERS.length, 1);
  return 'embedded_' + normalIdx;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/* ==========================================================================
   6. 4:5 INSTAGRAM POSTER GENERATOR WITH RANDOM LOCAL MANGA COVER IMAGES (img/)
   ========================================================================== */
function drawIMLStylePoster(evt) {
  const canvas = document.getElementById('posterCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  drawIMLStylePosterOnContext(ctx, evt, true);
}

function drawIMLStylePosterOnContext(ctx, evt, allowExternalImg = true) {
  ctx.canvas.width = 800;
  ctx.canvas.height = 1000;



  // 1. TOP ~55%: Beyblade Header Banner (Dark Base)
  const gradHeader = ctx.createLinearGradient(0, 0, 0, 550);
  gradHeader.addColorStop(0, '#0a0a0a');
  gradHeader.addColorStop(0.6, '#18181b');
  gradHeader.addColorStop(1, '#27272a');

  ctx.fillStyle = gradHeader;
  ctx.fillRect(0, 0, 800, 550);

  // 2. Background Grid Lines Accent (drawn under SVG lineart so lineart blends into grid)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 800; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 550);
    ctx.stroke();
  }
  for (let y = 0; y < 550; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(800, y);
    ctx.stroke();
  }

  // 3. Central Crop of Local Manga Cover (Dark Blended Lineart)
  if (allowExternalImg) {
    // Determine which embedded cover to use: 
    // events store coverImage as 'img/coverN.png' — extract the numeric index
    const coverUrl = evt.coverImage || '';
    const cacheKey = coverCacheKey(coverUrl || (evt.id || evt.title));
    const coverImg = loadedLocalImages[cacheKey];
    if (coverImg) {
      const destW = 800, destH = 550;
      const realW = coverImg.naturalWidth || coverImg.width || 800;
      const realH = coverImg.naturalHeight || coverImg.height || 550;
      const imgAspect = realW / realH;
      const destAspect = destW / destH;
      let sx = 0, sy = 0, sW = realW, sH = realH;

      if (imgAspect > destAspect) {
        sW = realH * destAspect;
        sx = (realW - sW) / 2;
      } else {
        sH = realW / destAspect;
        sy = (realH - sH) / 2;
      }

      try {
        ctx.save();
        ctx.globalAlpha = 0.35; // Lineart blended subtly with grid background
        ctx.drawImage(coverImg, sx, sy, sW, sH, 0, 0, destW, destH);
        ctx.restore();
      } catch (e) {
        console.warn('Unable to draw cover image on canvas context:', e);
      }

      // Dark Overlay Gradient at bottom of top section for text readability
      const gradOverlay = ctx.createLinearGradient(0, 300, 0, 550);
      gradOverlay.addColorStop(0, 'rgba(10, 10, 10, 0)');
      gradOverlay.addColorStop(0.7, 'rgba(18, 18, 27, 0.6)');
      gradOverlay.addColorStop(1, 'rgba(39, 39, 42, 0.95)');
      ctx.fillStyle = gradOverlay;
      ctx.fillRect(0, 300, 800, 250);
    } else {
      // Image not yet cached — load and redraw the main canvas once ready
      getLocalCoverImage(coverUrl || (evt.id || evt.title), () => {
        if (ctx.canvas && ctx.canvas.id === 'posterCanvas') {
          drawIMLStylePoster(evt);
        }
      });
    }
  }



  // Beyblade Ring Art
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(400, 200, 130, 0, Math.PI * 2);
  ctx.stroke();

  // Fluo Lime Inner Ring Accent
  ctx.strokeStyle = '#ccff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(400, 200, 90, 0, Math.PI * 2);
  ctx.stroke();

  // DISPLAY TOURNAMENT TITLE WITH FONT SCALING (NO OVERFLOW)
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';

  const titleText = (evt.title || 'BEYSIDE CUP').toUpperCase();
  fitCanvasText(ctx, titleText, 400, 430, 720, 72, '900');

  // Fluo Lime Title Line Accent
  ctx.fillStyle = '#ccff00';
  ctx.fillRect(350, 455, 100, 4);

  // ORGANIZING CLUB NAME UNDERNEATH WITH SCALING
  ctx.fillStyle = '#a1a1aa';
  const clubText = `ORGANIZZATO DA: ${(evt.organizingClub || 'Milano BeyBlade Club').toUpperCase()}`;
  fitCanvasText(ctx, clubText, 400, 510, 720, 24, '800');

  // 2. BOTTOM ~45%: Clean White Grid Block
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 550, 800, 450);

  ctx.fillStyle = '#e2e8f0';
  for (let dx = 40; dx < 800; dx += 40) {
    for (let dy = 570; dy < 1000; dy += 40) {
      ctx.fillRect(dx, dy, 3, 3);
    }
  }

  const dateParts = (evt.date || '2026-10-15').split('-');
  const dayNum = dateParts[2] || '15';
  const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const monthStr = monthNames[parseInt(dateParts[1] || '10') - 1] || 'OTT';

  let cityStr = 'MILANO';
  if (evt.title && evt.title.includes('-')) {
    cityStr = evt.title.split('-')[1].trim().toUpperCase();
  } else if (evt.location) {
    cityStr = evt.location.split(',')[0].trim().toUpperCase();
  }

  // BIG DATE NUMBER & CITY
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 90px Inter, sans-serif';
  ctx.fillText(dayNum, 50, 650);

  ctx.fillStyle = '#64748b';
  ctx.font = '800 24px Inter, sans-serif';
  ctx.fillText(monthStr, 50, 680);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 64px Inter, sans-serif';
  ctx.fillText(cityStr, 180, 650);

  ctx.fillStyle = '#64748b';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillText((evt.venue || 'Esports Arena').substring(0, 30), 180, 680);

  // METADATA LIST
  ctx.fillStyle = '#1e293b';
  ctx.font = '700 24px Inter, sans-serif';

  ctx.fillText(`Ore ${evt.time || '10:00'}`, 50, 750);
  ctx.fillText(`€ ${evt.fee || '15'} Quota Iscrizione`, 50, 800);
  ctx.fillText(`${evt.maxTeams || 16} Squadre (3-4 Giocatori)`, 50, 850);
  ctx.fillText(`${(evt.location || 'Via E. Fermi 12').substring(0, 45)}`, 50, 900);

  // Bottom-Right Brand Card with Fluo Lime Accent Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(440, 750, 320, 150);

  ctx.fillStyle = '#ccff00';
  ctx.fillRect(440, 750, 320, 6);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 24px Inter, sans-serif';
  ctx.fillText('BEYSIDE LEAGUE 2026', 600, 815);
  ctx.fillStyle = '#ccff00';
  ctx.font = '800 16px Inter, sans-serif';
  ctx.fillText('FORMATO 3V3 ROUND ROBIN', 600, 855);
}

function fitCanvasText(ctx, text, x, y, maxWidth, initialFontSize, fontWeight = '900') {
  let fontSize = initialFontSize;
  ctx.font = `${fontWeight} ${fontSize}px Inter, sans-serif`;
  
  while (ctx.measureText(text).width > maxWidth && fontSize > 14) {
    fontSize -= 2;
    ctx.font = `${fontWeight} ${fontSize}px Inter, sans-serif`;
  }

  let textToDraw = text;
  if (ctx.measureText(textToDraw).width > maxWidth) {
    while (ctx.measureText(textToDraw + '...').width > maxWidth && textToDraw.length > 0) {
      textToDraw = textToDraw.slice(0, -1);
    }
    textToDraw += '...';
  }
  
  ctx.fillText(textToDraw, x, y);
}

function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

async function downloadPosterImage(downloadButton) {
  const eventId = downloadButton?.dataset?.eventId || new URLSearchParams(window.location.hash.split('?')[1] || '').get('id');
  const evt = eventId ? window.storageManager.getEventById(eventId) : window.currentDetailEvent;
  const posterCanvas = document.getElementById('posterCanvas');
  if (!evt || !posterCanvas) {
    showToast('Apri prima la pagina del torneo da scaricare.', 'error');
    return;
  }

  const fileName = `beyside_${(evt.title || 'torneo').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_4x5.png`;
  try {
    // Export the exact canvas visible in the page. The event id is kept on
    // the button too, which is more reliable than a global variable on mobile browsers.
    const dataUri = posterCanvas.toDataURL('image/png');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // Mobile browsers cannot write directly into the Gallery. The native share
    // sheet offers "Save image" and preserves the PNG as a proper photo.
    if (isMobile && navigator.share && typeof File !== 'undefined') {
      const imageFile = new File([dataURItoBlob(dataUri)], fileName, { type: 'image/png' });
      if (!navigator.canShare || navigator.canShare({ files: [imageFile] })) {
        await navigator.share({ files: [imageFile], title: evt.title || 'Locandina BeySide' });
        showToast('Scegli “Salva immagine” per aggiungerla alla galleria.', 'success');
        return;
      }
    }

    triggerPosterDownload(dataUri, fileName);
    showToast('Locandina scaricata con successo!', 'success');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    console.error('Canvas export failed:', error);
    showToast('Errore durante il download. Prova a ricaricare la pagina.', 'error');
  }
}


function triggerPosterDownload(dataUri, fileName) {
  try {
    const blob = dataURItoBlob(dataUri);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch (err) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUri;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 200);
  }
}

/* ==========================================================================
   7. CLASSIFICA (NICKNAME PROMINENCE)
   ========================================================================== */
function renderStandingsTeamIcon(team) {
  const icon = team.iconUrl || team.tag || team.name || '?';
  const imageSource = typeof icon === 'string' && /^(https?:\/\/|data:image\/)/i.test(icon);
  if (imageSource) {
    return `<span class="standings-team-icon"><img src="${escapeHtml(icon)}" alt=""></span>`;
  }
  return `<span class="standings-team-icon">${escapeHtml(String(icon).slice(0, 2).toUpperCase())}</span>`;
}

function renderClassifica() {
  const tableBody = document.getElementById('standingsTableBody');
  if (!tableBody) return;

  const teams = window.storageManager.getTeams();
  const searchVal = (document.getElementById('standingsSearchInput')?.value || '').toLowerCase();

  const filteredTeams = teams.filter(t => {
    return (t.name || '').toLowerCase().includes(searchVal) ||
           (t.tag || '').toLowerCase().includes(searchVal) ||
           (t.city || '').toLowerCase().includes(searchVal) ||
           (t.captain || '').toLowerCase().includes(searchVal);
  });

  if (filteredTeams.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nessuna squadra trovata nella classifica.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredTeams.map((team, idx) => `
    <tr>
      <td data-label="Posizione"><span class="rank-number">#${idx + 1}</span></td>
      <td data-label="Squadra">
        <div class="team-name-cell">${renderStandingsTeamIcon(team)}<span>${escapeHtml(team.name)} <span class="team-tag-badge">[${escapeHtml(team.tag)}]</span></span></div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Capitano: ${escapeHtml(team.captain)} ${team.city ? `(${escapeHtml(team.city)})` : ''}</div>
      </td>
      <td data-label="Punti"><strong>${team.points || 0} PTS</strong></td>
      <td data-label="Giocate">${team.played || 0}</td>
      <td data-label="Roster">
        <button class="btn btn-secondary btn-sm" onclick="toggleRosterView('${team.id}')">
          Vedi
        </button>
      </td>
    </tr>
    <tr id="roster-row-${team.id}" style="display: none; background-color: var(--bg-input);">
      <td colspan="5" style="padding: 1rem;">
        <div style="font-size:0.8rem; font-weight:800; text-transform:uppercase; margin-bottom:0.4rem;">
          Roster Giocatori (${(team.players || []).length}/4):
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          ${(team.players || []).map(p => `
            <div style="background-color:var(--bg-card); border:1px solid var(--border-color); padding:0.3rem 0.6rem; border-radius:var(--radius-md); font-size:0.8rem;">
              <strong class="player-nick-bold">${escapeHtml(p.nickname || p.name)}</strong> ${p.nickname ? `<span class="player-name-sub">(${escapeHtml(p.name)})</span>` : ''}
            </div>
          `).join('')}
        </div>
      </td>
    </tr>
  `).join('');
}

function toggleRosterView(teamId) {
  const row = document.getElementById(`roster-row-${teamId}`);
  if (row) {
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }
}

/* ==========================================================================
   8. ADMIN PANEL (CLUBS & TOURNEYS & TEAMS DELETION)
   ========================================================================== */
function renderAdminTable() {
  const tableBody = document.getElementById('adminEventsTableBody');
  const teamsTableBody = document.getElementById('adminTeamsTableBody');
  const clubsTableBody = document.getElementById('adminClubsTableBody');

  if (tableBody) {
    const events = window.storageManager.getEvents();

    if (events.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            Nessun torneo creato. Clicca "+ Nuovo Torneo" per aggiungerne uno.
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = events.map(evt => {
        const registeredCount = (evt.registeredTeamIds || []).length;
        const statusClass = evt.status === 'concluso' ? 'concluso' : (evt.status === 'in_corso' ? 'in_corso' : 'aperto');
        return `
          <tr class="admin-data-row">
            <td data-label="Torneo">
              <a href="#torneo-detail?id=${evt.id}" onclick="openTournamentDetailPage('${evt.id}')" style="cursor:pointer; color:var(--text-main); font-weight:800; text-decoration:underline;">
                ${escapeHtml(evt.title)}
              </a>
            </td>
            <td data-label="Club">${escapeHtml(evt.organizingClub || 'BeySide Club')}</td>
            <td data-label="Data">${formatDate(evt.date)} ${escapeHtml(evt.time || '')}</td>
            <td data-label="Stato"><span class="status-badge ${statusClass}">[${(evt.status || 'aperto').toUpperCase()}]</span></td>
            <td data-label="Squadre"><strong>${registeredCount} / ${evt.maxTeams}</strong> Squadre</td>
            <td class="actions-cell" data-label="Azioni">
              <div class="admin-row-actions">
                <button class="btn btn-secondary btn-sm" onclick="editEvent('${evt.id}')">Modifica</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteEvent('${evt.id}')">Elimina</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (teamsTableBody) {
    const teams = window.storageManager.getTeams();

    if (teams.length === 0) {
      teamsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            Nessuna squadra registrata.
          </td>
        </tr>
      `;
    } else {
      teamsTableBody.innerHTML = teams.map(team => `
        <tr class="admin-data-row">
          <td data-label="Squadra"><strong>${escapeHtml(team.name)}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">[${escapeHtml(team.tag)}]</span></td>
          <td data-label="Capitano">${escapeHtml(team.captain)} (${escapeHtml(team.email || 'N/A')})</td>
          <td data-label="Città">${escapeHtml(team.city || 'N/A')}</td>
          <td data-label="Punti"><strong>${team.points || 0} PTS</strong> (${team.wins || 0}V / ${team.losses || 0}P)</td>
          <td class="actions-cell" data-label="Azioni">
            <button class="btn btn-danger btn-sm" onclick="deleteTeamFromAdmin('${team.id}')">
              Elimina Squadra
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  if (clubsTableBody) {
    const clubs = window.storageManager.getClubs();

    if (clubs.length === 0) {
      clubsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            Nessun club organizzatore registrato.
          </td>
        </tr>
      `;
    } else {
      clubsTableBody.innerHTML = clubs.map(club => `
        <tr class="admin-data-row">
          <td data-label="Club"><strong>${escapeHtml(club.name)}</strong></td>
          <td data-label="Città">${escapeHtml(club.city || 'N/A')}</td>
          <td data-label="Leader">${escapeHtml(club.leaderNickname || 'N/A')}</td>
          <td data-label="Access Key">
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
              <code style="background-color:var(--bg-card); padding:0.2rem 0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-weight:800; letter-spacing:0.05em; color:var(--accent-blue);">${escapeHtml(club.accessKey || 'N/A')}</code>
              ${club.accessKey ? `<button type="button" class="btn btn-secondary btn-sm" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="copyClubKeyFromAdmin('${escapeHtml(club.accessKey)}')">Copia</button>` : ''}
            </div>
          </td>
          <td class="actions-cell" data-label="Azioni">
            <button class="btn btn-danger btn-sm" onclick="deleteClubFromAdmin('${club.id}')">
              Elimina Club
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  renderAdminRequestsTable();
}

let currentApprovedData = null;

function openClubApprovedModal(data) {
  currentApprovedData = data;

  const clubNameEl = document.getElementById('approvedClubNameDisplay');
  const leaderEl = document.getElementById('approvedLeaderDisplay');
  const emailEl = document.getElementById('approvedEmailDisplay');
  const keyEl = document.getElementById('approvedKeyDisplay');
  const previewEl = document.getElementById('approvedEmailBodyPreview');
  const sendEmailBtn = document.getElementById('approvedSendEmailBtn');

  if (clubNameEl) clubNameEl.textContent = data.clubName;
  if (leaderEl) leaderEl.textContent = data.leaderNickname || 'Club Leader';
  if (emailEl) emailEl.textContent = data.email || 'Nessuna email specificata';
  if (keyEl) keyEl.textContent = data.accessKey;

  const emailSubject = `Accesso Club Leader BeySide - ${data.clubName}`;
  const emailBody = `Ciao ${data.leaderNickname || 'Club Leader'}\n\nLa richiesta per il tuo Club "${data.clubName}" è stata approvata!\n\nEcco i dati per accedere al pannello di controllo del tuo Club su BeySide:\n- Sezione: ADMIN del sito BeySide\n- Username: ${data.clubName}\n- Password / Access Key: ${data.accessKey}\n\nDal tuo pannello potrai creare nuovi tornei ufficiali e gestire gli eventi del tuo club.\n\nTeam BeySide`;

  if (previewEl) previewEl.value = emailBody;

  if (sendEmailBtn) {
    if (data.email) {
      sendEmailBtn.style.display = 'inline-flex';
      const mailtoUrl = `mailto:${encodeURIComponent(data.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      sendEmailBtn.href = mailtoUrl;
      sendEmailBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = mailtoUrl;
      };
    } else {
      sendEmailBtn.style.display = 'none';
    }
  }

  openModal('clubApprovedModal');
}

const _reqNotesMap = {};

function renderAdminRequestsTable() {
  const tableBody = document.getElementById('adminClubRequestsTableBody');
  const badge = document.getElementById('pendingRequestsBadge');
  const container = document.getElementById('adminClubRequestsContainer');
  if (!tableBody) return;

  const allRequests = window.storageManager.getClubRequests();
  const requests = allRequests.filter(r => (r.status || 'pending').toLowerCase() === 'pending' && (r.clubName || '').trim().toLowerCase() !== 'prova');
  const pendingCount = requests.length;

  if (container) {
    container.style.display = pendingCount > 0 ? 'block' : 'none';
  }

  if (badge) {
    badge.style.display = 'inline-block';
    if (pendingCount > 0) {
      badge.className = 'status-badge in_corso';
      badge.textContent = `[${pendingCount} IN ATTESA]`;
    } else {
      badge.className = 'status-badge concluso';
      badge.textContent = `[0 IN ATTESA]`;
    }
  }

  if (requests.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          Nessuna richiesta di club in attesa.
        </td>
      </tr>
    `;
    return;
  }

  // Store notes in global map to avoid inline-escaping issues
  requests.forEach(r => { _reqNotesMap[r.id] = { clubName: r.clubName, notes: r.notes || '' }; });

  tableBody.innerHTML = requests.map(req => {
    const hasNotes = !!(req.notes && req.notes.trim());
    const noteCell = hasNotes
      ? '<button type="button" class="btn btn-secondary btn-sm" style="padding:0.2rem 0.5rem;font-size:0.73rem;" data-reqid="' + req.id + '">Vedi Note</button>'
      : '<span style="color:var(--text-muted);">&#8212;</span>';
    return '<tr class="req-data-row">'
      + '<td><strong>' + escapeHtml(req.clubName) + '</strong></td>'
      + '<td>' + escapeHtml(req.leaderNickname || 'N/A') + '</td>'
      + '<td style="font-size:0.8rem;">' + escapeHtml(req.email || 'N/A') + '</td>'
      + '<td style="text-align:center;">' + noteCell + '</td>'
      + '<td style="text-align:right;">'
      +   '<div style="display:inline-flex;gap:0.4rem;">'
      +     '<button class="btn btn-primary btn-sm" onclick="approveClubRequestAction(\'' + req.id + '\')">Accetta</button>'
      +     '<button class="btn btn-danger btn-sm" onclick="rejectClubRequestAction(\'' + req.id + '\')">Rifiuta</button>'
      +   '</div>'
      + '</td>'
      + '</tr>';
  }).join('');

  // Attach click handlers for 'Vedi Note' buttons (avoids inline escaping)
  tableBody.querySelectorAll('[data-reqid]').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.dataset.reqid;
      const info = _reqNotesMap[id];
      if (info) showRequestNoteModal(info.clubName, info.notes);
    });
  });
}
function approveClubRequestAction(reqId) {
  const res = window.storageManager.approveClubRequest(reqId);
  if (res.success) {
    showToast(`Club "${res.club.name}" approvato! Chiave: ${res.accessKey}`, 'success');
    renderAdminTable();
    renderAdminRequestsTable();
    populateClubDropdown();

    const leader = res.leaderNickname || 'Club Leader';
    const club = res.club.name;
    const key = res.accessKey;
    const email = res.email || '';

    if (email) {
      const emailSubject = `Accesso Club Leader BeySide - ${club}`;
      const emailBody = `Ciao ${leader},\r\n\r\nLa richiesta per il tuo Club "${club}" è stata approvata!\r\n\r\nEcco i dati per accedere al pannello di controllo del tuo Club su BeySide:\r\n- Username: ${club}\r\n- Password / Access Key: ${key}\r\n\r\nDal tuo pannello potrai creare nuovi tornei ufficiali e gestire gli eventi del tuo club.\r\n\r\nTeam BeySide`;
      
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

      // 1. Copy body to clipboard automatically
      if (navigator.clipboard) {
        navigator.clipboard.writeText(emailBody).catch(() => {});
      }

      // 2. Automatically open Gmail Web compose in a new tab
      try {
        window.open(gmailUrl, '_blank');
      } catch (err) {
        console.warn('Auto open Gmail tab blocked', err);
      }

      // 3. Show clean inline action banner
      const noticeBox = document.getElementById('adminApprovalNoticeBox');
      if (noticeBox) {
        noticeBox.style.display = 'block';
        noticeBox.innerHTML = `
          <div style="background-color:var(--bg-card); border:2px solid var(--accent-blue); border-radius:var(--radius-md); padding:1rem; margin-bottom:1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.75rem;">
              <div>
                <div style="font-weight:900; font-size:1.05rem; color:var(--text-main); margin-bottom:0.25rem;">
                  Club "${escapeHtml(club)}" Approvato con Successo!
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.35rem;">
                  Email: <strong style="color:var(--text-main);">${escapeHtml(email)}</strong> | Access Key: <code style="background-color:var(--bg-input); padding:0.15rem 0.4rem; border-radius:3px; font-weight:800; color:var(--accent-blue);">${escapeHtml(key)}</code>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted);">
                  Il testo dell'email con le credenziali è stato copiato negli appunti.
                </div>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <a href="${gmailUrl}" target="_blank" class="btn btn-primary btn-sm" style="font-weight:800;">
                  Apri Gmail Web
                </a>
                <button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('#adminApprovalNoticeBox').style.display='none'">
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        `;
      }
    }
  } else {
    showToast(res.message || 'Errore durante l\'approvazione.', 'error');
  }
}

function rejectClubRequestAction(reqId) {
  if (confirm("Vuoi rifiutare ed eliminare questa richiesta di Club?")) {
    const res = window.storageManager.rejectClubRequest(reqId);
    if (res.success) {
      showToast("Richiesta eliminata.", "info");
      renderAdminRequestsTable();
    }
  }
}

function reopenApprovedModal(reqId) {
  const req = (window.storageManager.getClubRequests() || []).find(r => r.id === reqId);
  if (!req) return;
  openClubApprovedModal({
    clubName: req.clubName,
    leaderNickname: req.leaderNickname,
    email: req.email,
    accessKey: req.generatedKey
  });
}

function initClubRequestForm() {
  const reqForm = document.getElementById('clubRequestForm');
  if (reqForm) {
    reqForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitClubRequest(e);
    });
  }
}

function openClubRequestModal() {
  const form = document.getElementById('clubRequestForm');
  if (form) form.reset();
  openModal('clubRequestModal');
}

function submitClubRequest(e) {
  if (e) e.preventDefault();
  const clubName = document.getElementById('reqClubNameInput')?.value.trim();
  const city = document.getElementById('reqCityInput')?.value.trim();
  const leaderNickname = document.getElementById('reqLeaderNickInput')?.value.trim();
  const email = document.getElementById('reqEmailInput')?.value.trim();
  const notes = document.getElementById('reqNotesInput')?.value.trim();

  if (!clubName || !city || !leaderNickname || !email) {
    showToast('Compila tutti i campi obbligatori della richiesta.', 'error');
    return;
  }

  window.storageManager.addClubRequest({ clubName, city, leaderNickname, email, notes });
  closeModal('clubRequestModal');
  showToast('Richiesta inviata con successo! L\'Admin valuterà la tua candidatura.', 'success');

  const session = window.storageManager.getCurrentAdminSession();
  if (session && session.role === 'admin') {
    renderAdminRequestsTable();
  }
}

function initClubForm() {
  const clubForm = document.getElementById('newClubForm');
  if (clubForm) {
    clubForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNewClub();
    });
  }
}

function saveNewClub() {
  const name = document.getElementById('clubNameInput')?.value.trim();
  const city = document.getElementById('clubCityInput')?.value.trim();
  const leaderNickname = document.getElementById('clubLeaderNickInput')?.value.trim();
  const email = document.getElementById('clubEmailInput')?.value.trim();

  if (!name || !city || !leaderNickname) {
    showToast('Compila Nome Club, Città e Nickname Leader.', 'error');
    return;
  }

  const newClub = window.storageManager.addClub({ name, city, leaderNickname, email });
  showToast(`Club "${name}" creato con successo!`, 'success');
  closeModal('clubModal');
  renderAdminTable();
  populateClubDropdown();

  openClubApprovedModal({
    clubName: newClub.name,
    leaderNickname: newClub.leaderNickname,
    email: newClub.email,
    accessKey: newClub.accessKey
  });
}

function deleteClubFromAdmin(clubId) {
  if (confirm("Eliminare questo Club Organizzatore?")) {
    window.storageManager.deleteClub(clubId);
    showToast("Club eliminato.", "info");
    renderAdminTable();
    populateClubDropdown();
  }
}

function populateClubDropdown() {
  const select = document.getElementById('eventClubSelect');
  if (!select) return;

  const clubs = window.storageManager.getClubs();
  if (clubs.length === 0) {
    select.innerHTML = `<option value="BeySide Club">BeySide Club</option>`;
  } else {
    select.innerHTML = clubs.map(c => `
      <option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.city || '')})</option>
    `).join('');
  }
}

function deleteTeamFromAdmin(teamId) {
  const team = window.storageManager.getTeamById(teamId);
  if (!team) return;

  if (confirm(`Sei sicuro di voler eliminare la squadra "${team.name}"?`)) {
    window.storageManager.deleteTeam(teamId);
    showToast(`Squadra "${team.name}" eliminata dall'Admin.`, 'success');
    renderAdminTable();
    renderClassifica();
    renderEvents();
  }
}

function initEventForm() {
  const eventForm = document.getElementById('eventForm');
  if (eventForm) {
    eventForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEvent();
    });
  }
}

function renderClubLeaderPanel(session) {
  const clubNameEl = document.getElementById('clubLeaderClubName');
  const nickEl = document.getElementById('clubLeaderNick');
  const cityEl = document.getElementById('clubLeaderCity');
  const nickEditInput = document.getElementById('clubLeaderNickEditInput');
  const cityEditInput = document.getElementById('clubLeaderCityEditInput');
  const eventsTable = document.getElementById('clubLeaderEventsTableBody');

  const club = (session.clubId && window.storageManager.getClubById(session.clubId)) || window.storageManager.getClubByName(session.clubName) || {};
  const currentNick = club.leaderNickname || session.leaderNickname || '';
  const currentCity = club.city || session.city || '';

  if (clubNameEl) clubNameEl.textContent = session.clubName;
  if (nickEl) nickEl.textContent = currentNick || 'Club Leader';
  if (cityEl) cityEl.textContent = currentCity || '';
  if (nickEditInput) nickEditInput.value = currentNick;
  if (cityEditInput) cityEditInput.value = currentCity;

  if (eventsTable) {
    const allEvents = window.storageManager.getEvents();
    const clubEvents = allEvents.filter(evt =>
      (evt.organizingClub || '').trim().toLowerCase() === session.clubName.trim().toLowerCase()
    );

    if (clubEvents.length === 0) {
      eventsTable.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Nessun torneo creato per <strong>${escapeHtml(session.clubName)}</strong>.<br>
            Clicca sul tasto <strong>"+ Nuovo Torneo"</strong> in alto per pubblicare il tuo primo evento!
          </td>
        </tr>
      `;
    } else {
      eventsTable.innerHTML = clubEvents.map(evt => {
        const registeredCount = (evt.registeredTeamIds || []).length;
        const statusClass = evt.status === 'concluso' ? 'concluso' : (evt.status === 'in_corso' ? 'in_corso' : 'aperto');
        return `
          <tr class="admin-data-row">
            <td data-label="Torneo">
              <a href="#torneo-detail?id=${evt.id}" onclick="openTournamentDetailPage('${evt.id}')" style="cursor:pointer; color:var(--text-main); font-weight:800; text-decoration:underline;">
                ${escapeHtml(evt.title)}
              </a>
            </td>
            <td data-label="Data">${formatDate(evt.date)} ${escapeHtml(evt.time || '')}</td>
            <td data-label="Luogo">${escapeHtml(evt.venue || '')}</td>
            <td data-label="Stato"><span class="status-badge ${statusClass}">[${(evt.status || 'aperto').toUpperCase()}]</span></td>
            <td data-label="Squadre"><strong>${registeredCount} / ${evt.maxTeams}</strong> Squadre</td>
            <td class="actions-cell" data-label="Azioni">
              <div class="admin-row-actions">
                <button class="btn btn-secondary btn-sm" onclick="editEvent('${evt.id}')">Modifica</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteEvent('${evt.id}')">Elimina</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function openCreateEventModal() {
  const form = document.getElementById('eventForm');
  if (form) form.reset();

  const idInput = document.getElementById('eventIdInput');
  if (idInput) idInput.value = '';

  const titleEl = document.getElementById('eventModalTitle');
  if (titleEl) titleEl.textContent = 'Creazione Nuovo Torneo';

  const session = window.storageManager.getCurrentAdminSession();
  const selectGroup = document.getElementById('eventClubSelectGroup');
  const fixedGroup = document.getElementById('eventClubFixedGroup');
  const fixedDisplay = document.getElementById('eventClubFixedDisplay');
  const clubSelect = document.getElementById('eventClubSelect');
  const locationInput = document.getElementById('eventLocationInput');

  if (session && session.role === 'club_leader') {
    if (selectGroup) selectGroup.style.display = 'none';
    if (fixedGroup) fixedGroup.style.display = 'block';
    if (fixedDisplay) fixedDisplay.textContent = session.clubName;
    if (clubSelect) clubSelect.value = session.clubName;

    // Pre-fill Indirizzo e Città with the club's sede/city
    const club = (session.clubId && window.storageManager.getClubById(session.clubId)) || window.storageManager.getClubByName(session.clubName);
    const defaultCity = (club && club.city) || session.city || '';
    if (locationInput) {
      locationInput.value = defaultCity;
    }
  } else {
    if (selectGroup) selectGroup.style.display = 'block';
    if (fixedGroup) fixedGroup.style.display = 'none';
    populateClubDropdown();
  }

  openModal('eventModal');
}

function openCreateClubModal() {
  const form = document.getElementById('newClubForm');
  if (form) form.reset();
  openModal('clubModal');
}

function editEvent(id) {
  const evt = window.storageManager.getEventById(id);
  if (!evt) return;

  const session = window.storageManager.getCurrentAdminSession();
  const selectGroup = document.getElementById('eventClubSelectGroup');
  const fixedGroup = document.getElementById('eventClubFixedGroup');
  const fixedDisplay = document.getElementById('eventClubFixedDisplay');
  const clubSelect = document.getElementById('eventClubSelect');

  if (session && session.role === 'club_leader') {
    if (selectGroup) selectGroup.style.display = 'none';
    if (fixedGroup) fixedGroup.style.display = 'block';
    if (fixedDisplay) fixedDisplay.textContent = evt.organizingClub || session.clubName;
    if (clubSelect) clubSelect.value = evt.organizingClub || session.clubName;
  } else {
    if (selectGroup) selectGroup.style.display = 'block';
    if (fixedGroup) fixedGroup.style.display = 'none';
    populateClubDropdown();
    if (clubSelect) clubSelect.value = evt.organizingClub || '';
  }

  document.getElementById('eventIdInput').value = evt.id;
  document.getElementById('eventTitleInput').value = evt.title || '';
  document.getElementById('eventDateInput').value = evt.date || '';
  document.getElementById('eventTimeInput').value = evt.time || '';
  document.getElementById('eventVenueInput').value = evt.venue || '';
  document.getElementById('eventLocationInput').value = evt.location || '';
  document.getElementById('eventFeeInput').value = evt.fee || '15';
  document.getElementById('eventMaxTeamsInput').value = evt.maxTeams || 8;
  document.getElementById('eventDescriptionInput').value = evt.description || '';

  document.getElementById('eventModalTitle').textContent = 'Modifica Torneo';
  openModal('eventModal');
}

function saveEvent() {
  const id = document.getElementById('eventIdInput')?.value;
  const rawTitle = document.getElementById('eventTitleInput')?.value?.trim();
  const title = rawTitle ? rawTitle.substring(0, 35) : '';
  const session = window.storageManager.getCurrentAdminSession();

  let organizingClub = '';
  if (session && session.role === 'club_leader') {
    organizingClub = session.clubName;
  } else {
    organizingClub = document.getElementById('eventClubSelect')?.value;
    if (!organizingClub) {
      const clubs = window.storageManager.getClubs();
      organizingClub = clubs[0] ? clubs[0].name : 'BeySide Club';
    }
  }

  const date = document.getElementById('eventDateInput')?.value;
  const time = document.getElementById('eventTimeInput')?.value;
  const venue = document.getElementById('eventVenueInput')?.value?.trim();
  const location = document.getElementById('eventLocationInput')?.value?.trim() || '';
  const fee = document.getElementById('eventFeeInput')?.value?.trim() || '15';
  const maxTeams = parseInt(document.getElementById('eventMaxTeamsInput')?.value) || 8;
  const format = '3v3 Round Robin';
  const existingEvt = id ? window.storageManager.getEventById(id) : null;
  const status = existingEvt ? (existingEvt.status || 'aperto') : 'aperto';
  const description = document.getElementById('eventDescriptionInput')?.value?.trim() || '';

  if (!title || !date || !time || !venue) {
    showToast('Compila tutti i campi obbligatori del torneo.', 'error');
    return;
  }

  const eventData = {
    title,
    organizingClub,
    date,
    time,
    venue,
    location,
    fee,
    maxTeams,
    format,
    status,
    description
  };

  if (id && id !== '') {
    window.storageManager.updateEvent(id, eventData);
    showToast(`Torneo "${title}" aggiornato.`, 'success');
  } else {
    window.storageManager.addEvent(eventData);
    showToast(`Torneo "${title}" creato con successo.`, 'success');
  }

  closeModal('eventModal');
  renderEvents();

  if (session && session.role === 'club_leader') {
    renderClubLeaderPanel(session);
  } else {
    renderAdminTable();
  }
}

function confirmDeleteEvent(id) {
  const evt = window.storageManager.getEventById(id);
  if (!evt) return;

  if (confirm(`Eliminare il torneo "${evt.title}"?`)) {
    window.storageManager.deleteEvent(id);
    showToast('Torneo eliminato.', 'success');
    renderEvents();

    const session = window.storageManager.getCurrentAdminSession();
    if (session && session.role === 'club_leader') {
      renderClubLeaderPanel(session);
    } else {
      renderAdminTable();
    }
  }
}

function openEnrollmentModal(eventId) {
  const event = window.storageManager.getEventById(eventId);
  const teams = window.storageManager.getTeams();
  const loggedInTeam = window.storageManager.getCurrentUserTeam();

  if (!event) return;

  const eventTitleSpan = document.getElementById('enrollEventTitle');
  const teamSelect = document.getElementById('enrollTeamSelect');
  const eventIdHidden = document.getElementById('enrollEventIdHidden');

  if (eventTitleSpan) eventTitleSpan.textContent = event.title;
  if (eventIdHidden) eventIdHidden.value = event.id;

  if (teamSelect) {
    if (teams.length === 0) {
      teamSelect.innerHTML = `<option value="">Nessuna squadra disponibile.</option>`;
    } else {
      teamSelect.innerHTML = `<option value="">-- Seleziona Squadra --</option>` +
        teams.map(t => {
          const isAlreadyEnrolled = (event.registeredTeamIds || []).includes(t.id);
          const isSelected = loggedInTeam && loggedInTeam.id === t.id;
          return `<option value="${t.id}" ${isAlreadyEnrolled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}>
            ${escapeHtml(t.name)} [${t.tag}] (${t.players.length} giocatori) ${isAlreadyEnrolled ? '- (Già Iscritto)' : ''}
          </option>`;
        }).join('');
    }
  }

  openModal('enrollmentModal');
}

function submitEnrollment() {
  const eventId = document.getElementById('enrollEventIdHidden')?.value;
  const teamId = document.getElementById('enrollTeamSelect')?.value;

  if (!eventId || !teamId) {
    showToast('Seleziona una squadra.', 'error');
    return;
  }

  const result = window.storageManager.registerTeamToEvent(eventId, teamId);
  if (result.success) {
    showToast(result.message, 'success');
    closeModal('enrollmentModal');
    renderEvents();
    renderAdminTable();
    showTournamentDetailView(eventId);
  } else {
    showToast(result.message, 'error');
  }
}

function exportData(type) {
  window.storageManager.exportDataFile(type);
  showToast(`File ${type}.json scaricato.`, 'success');
}

function resetData() {
  if (confirm("Sei sicuro di voler azzerare tutti i dati (Tornei, Squadre, Club Organizzatori)?")) {
    window.storageManager.resetToDefaults();
    showToast("Tutti i dati sono stati azzerati con successo.", "success");
    renderEvents();
    renderClassifica();
    renderAdminTable();
    renderTeamAccountArea();
  }
}

function setupFilters() {
  const eventSearch = document.getElementById('eventSearchInput');
  const eventStatusFilter = document.getElementById('eventStatusFilter');
  const standingsSearch = document.getElementById('standingsSearchInput');

  if (eventSearch) eventSearch.addEventListener('input', renderEvents);
  if (eventStatusFilter) eventStatusFilter.addEventListener('change', renderEvents);
  if (standingsSearch) standingsSearch.addEventListener('input', renderClassifica);
}

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Admin & Club Leader Authentication and Views */
function submitAdminLogin(e) {
  if (e) e.preventDefault();
  const usernameInput = document.getElementById('adminUsernameInput');
  const passInput = document.getElementById('adminPasswordInput');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const pass = passInput ? passInput.value.trim() : '';

  if (!username || !pass) {
    showToast('Inserisci sia Username che Password/Access Key.', 'error');
    return;
  }

  const res = window.storageManager.loginAdminOrClub(username, pass);

  if (res.success) {
    if (res.role === 'admin') {
      showToast('Accesso Amministratore Globale effettuato con successo.', 'success');
    } else {
      showToast(`Accesso Club Leader: ${res.club.name}!`, 'success');
    }
    if (passInput) passInput.value = '';
    renderAdminView();
  } else {
    showToast(res.message || 'Credenziali non valide.', 'error');
  }
}

function logoutAdmin() {
  window.storageManager.logoutAdminSession();
  showToast('Logout effettuato con successo.', 'info');
  renderAdminView();
}

function renderAdminView() {
  const session = window.storageManager.getCurrentAdminSession();
  const authBox = document.getElementById('adminAuthContainer');
  const clubLeaderBox = document.getElementById('clubLeaderPanelContainer');
  const adminBox = document.getElementById('adminPanelContainer');

  if (!session) {
    if (authBox) authBox.style.display = 'block';
    if (clubLeaderBox) clubLeaderBox.style.display = 'none';
    if (adminBox) adminBox.style.display = 'none';
    return;
  }

  if (session.role === 'admin') {
    if (authBox) authBox.style.display = 'none';
    if (clubLeaderBox) clubLeaderBox.style.display = 'none';
    if (adminBox) adminBox.style.display = 'block';
    renderAdminTable();
  } else if (session.role === 'club_leader') {
    if (authBox) authBox.style.display = 'none';
    if (adminBox) adminBox.style.display = 'none';
    if (clubLeaderBox) clubLeaderBox.style.display = 'block';
    renderClubLeaderPanel(session);
  }
}

function copyApprovedKey() {
  if (currentApprovedData && currentApprovedData.accessKey) {
    navigator.clipboard.writeText(currentApprovedData.accessKey).then(() => {
      showToast('Access Key copiata negli appunti!', 'success');
    }).catch(() => {
      prompt('Copia la tua Access Key:', currentApprovedData.accessKey);
    });
  }
}

function copyApprovedEmailText() {
  const preview = document.getElementById('approvedEmailBodyPreview');
  if (preview && preview.value) {
    navigator.clipboard.writeText(preview.value).then(() => {
      showToast('Testo email copiato negli appunti!', 'success');
    }).catch(() => {
      prompt('Copia il testo dell\'email:', preview.value);
    });
  }
}

function copyCurrentClubKey() {
  const session = window.storageManager.getCurrentAdminSession();
  if (session && session.clubId) {
    const club = window.storageManager.getClubById(session.clubId);
    if (club && club.accessKey) {
      navigator.clipboard.writeText(club.accessKey).then(() => {
        showToast(`Chiave del club ${club.name} copiata!`, 'success');
      }).catch(() => {
        prompt('Chiave del tuo Club:', club.accessKey);
      });
    }
  }
}

function copyClubKeyFromAdmin(key) {
  if (key) {
    navigator.clipboard.writeText(key).then(() => {
      showToast('Access Key copiata negli appunti!', 'success');
    }).catch(() => {
      prompt('Access Key:', key);
    });
  }
}

function updateClubLeaderDetailsAction() {
  const session = window.storageManager.getCurrentAdminSession();
  if (!session || session.role !== 'club_leader') return;
  const nickInput = document.getElementById('clubLeaderNickEditInput');
  const cityInput = document.getElementById('clubLeaderCityEditInput');

  const newNick = nickInput ? nickInput.value.trim() : '';
  const newCity = cityInput ? cityInput.value.trim() : '';

  if (!newNick) {
    showToast('Inserisci un nickname valido per il leader.', 'error');
    return;
  }
  const res = window.storageManager.updateClubLeaderDetails(session.clubId, { leaderNickname: newNick, city: newCity });
  if (res.success) {
    showToast('Dati Club Leader aggiornati con successo!', 'success');
    renderAdminView();
  } else {
    showToast(res.message || 'Errore durante l\'aggiornamento.', 'error');
  }
}

function updateClubLeaderNicknameAction() {
  return updateClubLeaderDetailsAction();
}


function showRequestNoteModal(clubName, notes) {
  // Re-use a simple alert-style popup. Build or reuse a modal element.
  let modal = document.getElementById('requestNotePopup');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'requestNotePopup';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:1.5rem;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
          <strong id="requestNotePopupTitle" style="font-size:1rem;color:var(--text-main);"></strong>
          <button type="button" onclick="document.getElementById('requestNotePopup').style.display='none'" style="background:none;border:none;color:var(--text-muted);font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>
        </div>
        <p id="requestNotePopupBody" style="font-size:0.9rem;color:var(--text-muted);white-space:pre-wrap;margin:0;"></p>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.style.display='none'; });
  }
  document.getElementById('requestNotePopupTitle').textContent = `Note – ${clubName}`;
  document.getElementById('requestNotePopupBody').textContent = notes;
  modal.style.display = 'flex';
}

window.openTournamentDetailPage = openTournamentDetailPage;
window.openCreateEventModal = openCreateEventModal;
window.openCreateClubModal = openCreateClubModal;
window.openClubRequestModal = openClubRequestModal;
window.submitClubRequest = submitClubRequest;
window.approveClubRequestAction = approveClubRequestAction;
window.rejectClubRequestAction = rejectClubRequestAction;
window.showRequestNoteModal = showRequestNoteModal;
window.reopenApprovedModal = reopenApprovedModal;
window.copyApprovedKey = copyApprovedKey;
window.copyApprovedEmailText = copyApprovedEmailText;
window.copyCurrentClubKey = copyCurrentClubKey;
window.copyClubKeyFromAdmin = copyClubKeyFromAdmin;
window.updateClubLeaderNicknameAction = updateClubLeaderNicknameAction;
window.updateClubLeaderDetailsAction = updateClubLeaderDetailsAction;
window.editEvent = editEvent;
window.confirmDeleteEvent = confirmDeleteEvent;
window.deleteTeamFromAdmin = deleteTeamFromAdmin;
window.deleteClubFromAdmin = deleteClubFromAdmin;
window.deleteCurrentTeamAccount = deleteCurrentTeamAccount;
window.openEnrollmentModal = openEnrollmentModal;
window.submitEnrollment = submitEnrollment;
window.quickEnrollTeam = quickEnrollTeam;
window.quickDropTeam = quickDropTeam;
window.downloadPosterImage = downloadPosterImage;
window.toggleRosterView = toggleRosterView;
window.startSwissOnDetailPage = startSwissOnDetailPage;
window.generateNextSwissRoundOnDetailPage = generateNextSwissRoundOnDetailPage;
window.setSwissWinnerOnDetailPage = setSwissWinnerOnDetailPage;
window.concludeTournamentAction = concludeTournamentAction;
window.logoutCaptain = logoutCaptain;
window.closeModal = closeModal;
window.exportData = exportData;
window.resetData = resetData;
window.submitAdminLogin = submitAdminLogin;
window.logoutAdmin = logoutAdmin;
window.navigateToTab = navigateToTab;
