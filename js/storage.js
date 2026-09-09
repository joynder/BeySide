/**
 * Storage Manager for BeySide
 * Handles Teams, Accounts, Clubs, Events, Standings, and Exact Round Robin Pairings.
 */

const STORAGE_KEYS = {
  EVENTS: 'beyside_events_v6',
  TEAMS: 'beyside_teams_v6',
  CLUBS: 'beyside_clubs_v6',
  SESSION: 'beyside_session_v6',
  THEME: 'beyside_theme_v6'
};

const DEFAULT_CLUBS = [];
const DEFAULT_TEAMS = [];
const DEFAULT_EVENTS = [];

class StorageManager {
  constructor() {
    this.events = [];
    this.teams = [];
    this.clubs = [];
    this.currentTeamId = null;
    this.initSynchronous();
  }

  initSynchronous() {
    try {
      const localEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
      const localTeams = localStorage.getItem(STORAGE_KEYS.TEAMS);
      const localClubs = localStorage.getItem(STORAGE_KEYS.CLUBS);
      const localSession = localStorage.getItem(STORAGE_KEYS.SESSION);

      if (localEvents) {
        this.events = JSON.parse(localEvents);
      } else {
        this.events = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
        this.saveEvents();
      }

      if (localTeams) {
        this.teams = JSON.parse(localTeams);
      } else {
        this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
        this.saveTeams();
      }

      if (localClubs) {
        this.clubs = JSON.parse(localClubs);
      } else {
        this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
        this.saveClubs();
      }

      if (localSession) {
        this.currentTeamId = localSession;
      }

      // Migrate any old .svg cover references to .png
      let migrated = false;
      this.events.forEach(evt => {
        if (evt.coverImage && evt.coverImage.endsWith('.svg')) {
          evt.coverImage = evt.coverImage.replace(/\.svg$/, '.png');
          migrated = true;
        }
      });
      if (migrated) this.saveEvents();

    } catch (err) {
      console.warn("Storage init fallback", err);
      this.events = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
      this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
      this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
    }
  }

  saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(this.events));
    } catch (e) {
      console.error("Error saving events", e);
    }
  }

  saveTeams() {
    try {
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(this.teams));
    } catch (e) {
      console.error("Error saving teams", e);
    }
  }

  saveClubs() {
    try {
      localStorage.setItem(STORAGE_KEYS.CLUBS, JSON.stringify(this.clubs));
    } catch (e) {
      console.error("Error saving clubs", e);
    }
  }

  /* CLUBS MANAGEMENT */
  getClubs() {
    return this.clubs || [];
  }

  addClub({ name, city, logoUrl }) {
    const newClub = {
      id: 'club-' + Date.now(),
      name,
      city: city || '',
      logoUrl: logoUrl || name.substring(0, 1).toUpperCase()
    };
    this.clubs.unshift(newClub);
    this.saveClubs();
    return newClub;
  }

  deleteClub(id) {
    this.clubs = (this.clubs || []).filter(c => c.id !== id);
    this.saveClubs();
  }

  /* TEAM ACCOUNT & AUTHENTICATION */
  registerTeamAccount({ email, password, teamName, tag, captain, city, iconUrl }) {
    const existing = this.teams.find(t => t.email && t.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, message: 'Un account con questa email esiste già.' };
    }

    const newTeam = {
      id: 'team-' + Date.now(),
      name: teamName,
      tag: (tag || teamName.substring(0, 3)).toUpperCase(),
      captain: captain || 'Capitano',
      email: email.toLowerCase(),
      password: password,
      city: city || '',
      iconUrl: iconUrl || tag.substring(0, 1) || teamName.substring(0, 1),
      points: 0,
      played: 0,
      wins: 0,
      losses: 0,
      players: [
        { name: captain || 'Giocatore 1', nickname: 'Capitano' },
        { name: 'Giocatore 2', nickname: 'Blader 2' },
        { name: 'Giocatore 3', nickname: 'Blader 3' }
      ],
      createdAt: new Date().toISOString().split('T')[0]
    };

    this.teams.unshift(newTeam);
    this.saveTeams();
    this.loginTeamAccount(email, password);
    return { success: true, message: 'Account Squadra registrato con successo.' };
  }

  loginTeamAccount(email, password) {
    const team = this.teams.find(t => t.email && t.email.toLowerCase() === email.toLowerCase() && t.password === password);
    if (team) {
      this.currentTeamId = team.id;
      localStorage.setItem(STORAGE_KEYS.SESSION, team.id);
      return { success: true, team };
    }
    return { success: false, message: 'Email o password errati.' };
  }

  logoutTeamAccount() {
    this.currentTeamId = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  }

  getCurrentUserTeam() {
    if (!this.currentTeamId) return null;
    return this.getTeamById(this.currentTeamId);
  }

  updateTeamProfile(teamId, updatedFields) {
    const idx = this.teams.findIndex(t => t.id === teamId);
    if (idx !== -1) {
      this.teams[idx] = { ...this.teams[idx], ...updatedFields };
      this.saveTeams();
      return this.teams[idx];
    }
    return null;
  }

  getEvents() {
    return this.events || [];
  }

  getEventById(id) {
    return (this.events || []).find(e => e.id === id);
  }

  addEvent(eventData) {
    const covers = ['img/cover1.png', 'img/cover2.png', 'img/cover3.png', 'img/cover4.png', 'img/cover5.png'];
    const randomCover = covers[Math.floor(Math.random() * covers.length)];
    const newEvent = {
      id: 'evt-' + Date.now(),
      registeredTeamIds: [],
      swissRounds: [],
      organizingClub: eventData.organizingClub || (this.clubs[0] ? this.clubs[0].name : 'BeySide Club'),
      coverImage: eventData.coverImage || randomCover,
      ...eventData
    };
    if (!this.events) this.events = [];
    this.events.unshift(newEvent);
    this.saveEvents();
    return newEvent;
  }

  updateEvent(id, updatedFields) {
    const idx = (this.events || []).findIndex(e => e.id === id);
    if (idx !== -1) {
      this.events[idx] = { ...this.events[idx], ...updatedFields };
      this.saveEvents();
      return this.events[idx];
    }
    return null;
  }

  deleteEvent(id) {
    this.events = (this.events || []).filter(e => e.id !== id);
    this.saveEvents();
  }

  getTeams() {
    return [...(this.teams || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
  }

  getTeamById(id) {
    return (this.teams || []).find(t => t.id === id);
  }

  deleteTeam(id) {
    this.teams = (this.teams || []).filter(t => t.id !== id);
    (this.events || []).forEach(evt => {
      if (evt.registeredTeamIds) {
        evt.registeredTeamIds = evt.registeredTeamIds.filter(tId => tId !== id);
      }
      this.resolveRetiredTeamMatches(evt, id);
    });
    if (this.currentTeamId === id) this.logoutTeamAccount();
    this.saveEvents();
    this.saveTeams();
  }

  registerTeamToEvent(eventId, teamId) {
    const event = this.getEventById(eventId);
    if (!event) return { success: false, message: 'Torneo non trovato.' };

    if (!event.registeredTeamIds) event.registeredTeamIds = [];

    if (event.registeredTeamIds.includes(teamId)) {
      return { success: false, message: 'La tua squadra è già iscritta a questo torneo.' };
    }

    if (event.registeredTeamIds.length >= event.maxTeams) {
      return { success: false, message: 'Raggiunto il numero massimo di squadre per questo torneo.' };
    }

    event.registeredTeamIds.push(teamId);

    // Clear retired status if team re-enrolls
    if (event.retiredTeamIds) {
      event.retiredTeamIds = event.retiredTeamIds.filter(id => id !== teamId);
    }
    this.unresolveRetiredTeamMatches(event, teamId);

    this.saveEvents();
    return { success: true, message: 'Iscrizione completata con successo.' };
  }

  unregisterTeamFromEvent(eventId, teamId) {
    const event = this.getEventById(eventId);
    if (event && event.registeredTeamIds) {
      event.registeredTeamIds = event.registeredTeamIds.filter(id => id !== teamId);
      this.resolveRetiredTeamMatches(event, teamId);
      this.saveEvents();
      return true;
    }
    return false;
  }

  resolveRetiredTeamMatches(event, retiredTeamId) {
    if (!event) return;
    if (!event.retiredTeamIds) event.retiredTeamIds = [];
    if (!event.retiredTeamIds.includes(retiredTeamId)) {
      event.retiredTeamIds.push(retiredTeamId);
    }
    const resolveMatch = (m) => {
      if (!m.winnerId) {
        if (m.team1Id === retiredTeamId && m.team2Id !== 'BYE' && m.team2Id !== retiredTeamId) {
          m.winnerId = m.team2Id;
          m.notes = 'Vittoria a tavolino (Ritirata)';
        } else if (m.team2Id === retiredTeamId && m.team1Id !== 'BYE' && m.team1Id !== retiredTeamId) {
          m.winnerId = m.team1Id;
          m.notes = 'Vittoria a tavolino (Ritirata)';
        }
      }
    };
    (event.swissRounds || []).forEach(r => (r.matches || []).forEach(resolveMatch));
    (event.allScheduledRounds || []).forEach(rm => rm.forEach(resolveMatch));
  }

  unresolveRetiredTeamMatches(event, teamId) {
    if (!event) return;
    const resetMatch = (m) => {
      if (m.notes === 'Vittoria a tavolino (Ritirata)' && (m.team1Id === teamId || m.team2Id === teamId)) {
        delete m.winnerId;
        delete m.notes;
      }
    };
    (event.swissRounds || []).forEach(r => (r.matches || []).forEach(resetMatch));
    (event.allScheduledRounds || []).forEach(rm => rm.forEach(resetMatch));
  }

  /* EXACT ROUND ROBIN SCHEDULING (EVERY TEAM PLAYS EVERY OTHER TEAM ONCE) */
  getTotalRoundRobinRounds(eventId) {
    const event = this.getEventById(eventId);
    if (!event) return 0;
    const numTeams = (event.registeredTeamIds || []).length;
    if (numTeams < 2) return 0;
    return (numTeams % 2 === 0) ? numTeams - 1 : numTeams;
  }

  startSwissTournament(eventId) {
    const event = this.getEventById(eventId);
    if (!event) return { success: false, message: "Torneo non trovato." };

    const registeredIds = event.registeredTeamIds || [];
    if (registeredIds.length < 2) {
      return { success: false, message: "Servono almeno 2 squadre iscritte per avviare il torneo." };
    }

    event.status = 'in_corso';
    event.swissRounds = [];

    // Generate ALL Round Robin schedules systematically using Polygon Method
    const allRounds = this.generateCompleteRoundRobinSchedule(registeredIds);
    
    // Push Round 1
    event.swissRounds.push({
      roundNumber: 1,
      matches: allRounds[0],
      isCompleted: false
    });
    event.allScheduledRounds = allRounds;

    this.saveEvents();
    return { success: true, message: `Torneo avviato. Generato il Turno 1 (su ${allRounds.length} turni totali).` };
  }

  generateNextSwissRound(eventId) {
    const event = this.getEventById(eventId);
    if (!event) return { success: false, message: "Torneo non trovato." };

    const currentRounds = event.swissRounds || [];
    const allRounds = event.allScheduledRounds || [];

    if (currentRounds.length === 0) {
      return this.startSwissTournament(eventId);
    }

    const lastRound = currentRounds[currentRounds.length - 1];
    const unassigned = lastRound.matches.some(m => !m.winnerId && m.team2Id !== 'BYE');
    if (unassigned) {
      return { success: false, message: "Registra l'esito di tutte le sfide del turno attuale prima di avanzare." };
    }

    lastRound.isCompleted = true;
    const nextRoundNum = currentRounds.length + 1;

    if (nextRoundNum > allRounds.length) {
      return { success: false, message: "Tutti i turni del Round Robin sono stati disputati! Clicca su 'Concludi Torneo'." };
    }

    event.swissRounds.push({
      roundNumber: nextRoundNum,
      matches: allRounds[nextRoundNum - 1],
      isCompleted: false
    });

    this.saveEvents();
    return { success: true, message: `Generato il Turno ${nextRoundNum} di ${allRounds.length}.` };
  }

  generateCompleteRoundRobinSchedule(teamIds) {
    let teams = [...teamIds];
    if (teams.length % 2 !== 0) {
      teams.push('BYE');
    }

    const numTeams = teams.length;
    const numRounds = numTeams - 1;
    const halfSize = numTeams / 2;

    const schedule = [];

    for (let r = 0; r < numRounds; r++) {
      const roundMatches = [];
      for (let i = 0; i < halfSize; i++) {
        const team1Id = teams[i];
        const team2Id = teams[numTeams - 1 - i];

        if (team1Id !== 'BYE' || team2Id !== 'BYE') {
          const t1Obj = this.getTeamById(team1Id) || { name: 'Team' };
          const t2Obj = (team2Id === 'BYE') ? { name: 'BYE (Riposo)' } : (this.getTeamById(team2Id) || { name: 'Team' });

          roundMatches.push({
            matchId: `m-${r+1}-${i}`,
            team1Id: team1Id,
            team1Name: t1Obj.name,
            team2Id: team2Id,
            team2Name: t2Obj.name,
            winnerId: (team2Id === 'BYE') ? team1Id : null
          });
        }
      }
      schedule.push(roundMatches);

      // Polygon rotation: keep index 0 fixed, rotate others
      teams.splice(1, 0, teams.pop());
    }

    return schedule;
  }

  recordMatchWinner(eventId, roundNum, matchIndex, winnerId) {
    const event = this.getEventById(eventId);
    if (!event || !event.swissRounds) return false;

    const round = event.swissRounds.find(r => r.roundNumber === roundNum);
    if (!round || !round.matches[matchIndex]) return false;

    const match = round.matches[matchIndex];
    match.winnerId = winnerId;

    this.saveEvents();
    return true;
  }

  concludeTournament(eventId) {
    const event = this.getEventById(eventId);
    if (!event) return { success: false, message: "Torneo non trovato." };

    event.status = 'concluso';
    if (event.swissRounds && event.swissRounds.length > 0) {
      const lastRound = event.swissRounds[event.swissRounds.length - 1];
      lastRound.isCompleted = true;
    }

    const tournamentScores = {};
    (event.registeredTeamIds || []).forEach(tId => {
      tournamentScores[tId] = { wins: 0, matches: 0 };
    });

    (event.swissRounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (m.winnerId) {
          if (!tournamentScores[m.winnerId]) tournamentScores[m.winnerId] = { wins: 0, matches: 0 };
          tournamentScores[m.winnerId].wins += 1;
          tournamentScores[m.winnerId].matches += 1;
        }
        if (m.team1Id && m.team1Id !== 'BYE' && m.team1Id !== m.winnerId) {
          if (!tournamentScores[m.team1Id]) tournamentScores[m.team1Id] = { wins: 0, matches: 0 };
          tournamentScores[m.team1Id].matches += 1;
        }
        if (m.team2Id && m.team2Id !== 'BYE' && m.team2Id !== m.winnerId) {
          if (!tournamentScores[m.team2Id]) tournamentScores[m.team2Id] = { wins: 0, matches: 0 };
          tournamentScores[m.team2Id].matches += 1;
        }
      });
    });

    Object.keys(tournamentScores).forEach(teamId => {
      const t = this.getTeamById(teamId);
      if (t) {
        const wins = tournamentScores[teamId].wins;
        const matches = tournamentScores[teamId].matches;
        t.wins = (t.wins || 0) + wins;
        t.losses = (t.losses || 0) + Math.max(0, matches - wins);
        t.played = (t.played || 0) + matches;
        t.points = (t.points || 0) + (wins * 3) + matches;
      }
    });

    this.saveTeams();
    this.saveEvents();
    return { success: true, message: "Torneo concluso. Risultati accreditati in classifica ufficiale." };
  }

  exportDataFile(type) {
    let dataStr = "";
    let filename = "";

    if (type === 'events') {
      dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.events, null, 2));
      filename = "events.json";
    } else if (type === 'teams') {
      dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.teams, null, 2));
      filename = "teams.json";
    }

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  resetToDefaults() {
    localStorage.removeItem(STORAGE_KEYS.EVENTS);
    localStorage.removeItem(STORAGE_KEYS.TEAMS);
    localStorage.removeItem(STORAGE_KEYS.CLUBS);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    this.events = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
    this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
    this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
    this.currentTeamId = null;
    this.saveEvents();
    this.saveTeams();
    this.saveClubs();
  }
}

window.storageManager = new StorageManager();
