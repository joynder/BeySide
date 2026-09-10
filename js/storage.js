/**
 * Storage Manager for BeySide
 * Handles Teams, Accounts, Clubs, Events, Standings, and Exact Round Robin Pairings.
 */

const STORAGE_KEYS = {
  EVENTS: 'beyside_events_v6',
  TEAMS: 'beyside_teams_v6',
  CLUBS: 'beyside_clubs_v6',
  CLUB_REQUESTS: 'beyside_club_requests_v6',
  SESSION: 'beyside_session_v6',
  ADMIN_SESSION: 'beyside_admin_session_v6',
  THEME: 'beyside_theme_v6'
};

const DEFAULT_CLUBS = [];
const DEFAULT_TEAMS = [];
const DEFAULT_EVENTS = [];
const DEFAULT_CLUB_REQUESTS = [];

// Questa è una chiave "publishable": è prevista per essere inclusa nel sito.
// La sicurezza effettiva è definita dalle policy SQL in supabase-setup.sql.
const SUPABASE_URL = 'https://vbtlxeelyhxudioycgzj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NlLCN_J8yLYyBJlO0XFIYA_w1PPmTsg';
const SUPABASE_STATE_TABLE = 'beyside_state';
const SUPABASE_STATE_ID = 'global';

class StorageManager {
  constructor() {
    this.events = [];
    this.teams = [];
    this.clubs = [];
    this.clubRequests = [];
    this.currentTeamId = null;
    this.adminSession = null;
    this.remoteEnabled = false;
    this.remoteSyncPending = false;
    this.remoteSyncInFlight = false;
    this.remoteSaveTimer = null;
    this.remoteVersion = null;
    this.lastSharedState = null;
    this.supabaseClient = null;
    this.syncStarted = false;
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
        this.saveLocal(STORAGE_KEYS.EVENTS, this.events);
      }

      if (localTeams) {
        this.teams = JSON.parse(localTeams);
      } else {
        this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
        this.saveLocal(STORAGE_KEYS.TEAMS, this.teams);
      }

      if (localClubs) {
        this.clubs = JSON.parse(localClubs);
      } else {
        this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
        this.saveLocal(STORAGE_KEYS.CLUBS, this.clubs);
      }

      const localClubRequests = localStorage.getItem(STORAGE_KEYS.CLUB_REQUESTS);
      if (localClubRequests) {
        this.clubRequests = JSON.parse(localClubRequests);
        // Clean up test requests
        this.clubRequests = (this.clubRequests || []).filter(r => (r.clubName || '').trim().toLowerCase() !== 'prova');
      } else {
        this.clubRequests = JSON.parse(JSON.stringify(DEFAULT_CLUB_REQUESTS));
      }
      this.saveLocal(STORAGE_KEYS.CLUB_REQUESTS, this.clubRequests);

      if (localSession) {
        this.currentTeamId = localSession;
      }

      const localAdminSession = localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
      if (localAdminSession) {
        try {
          this.adminSession = JSON.parse(localAdminSession);
        } catch (e) {
          this.adminSession = null;
        }
      }

      // Migrate any old .svg cover references to .png
      let migrated = false;
      this.events.forEach(evt => {
        if (evt.coverImage && evt.coverImage.endsWith('.svg')) {
          evt.coverImage = evt.coverImage.replace(/\.svg$/, '.png');
          migrated = true;
        }
      });
      if (migrated) this.saveLocal(STORAGE_KEYS.EVENTS, this.events);

    } catch (err) {
      console.warn("Storage init fallback", err);
      this.events = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
      this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
      this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
      this.clubRequests = JSON.parse(JSON.stringify(DEFAULT_CLUB_REQUESTS));
    }
  }

  saveEvents() {
    this.saveLocal(STORAGE_KEYS.EVENTS, this.events);
    this.queueRemoteSync();
  }

  saveTeams() {
    this.saveLocal(STORAGE_KEYS.TEAMS, this.teams);
    this.queueRemoteSync();
  }

  saveClubs() {
    this.saveLocal(STORAGE_KEYS.CLUBS, this.clubs);
    this.queueRemoteSync();
  }

  saveClubRequests() {
    this.saveLocal(STORAGE_KEYS.CLUB_REQUESTS, this.clubRequests);
    this.queueRemoteSync();
  }

  saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Error saving local data", e);
    }
  }

  getSharedState() {
    return {
      events: this.events || [],
      teams: this.teams || [],
      clubs: this.clubs || [],
      clubRequests: this.clubRequests || []
    };
  }

  hasSharedData(state) {
    return state.events.length > 0 || state.teams.length > 0 || state.clubs.length > 0 || (state.clubRequests || []).length > 0;
  }

  applySharedState(state) {
    if (!state || !Array.isArray(state.events) || !Array.isArray(state.teams) || !Array.isArray(state.clubs)) {
      throw new Error('Formato dei dati condivisi non valido.');
    }
    this.events = state.events;
    this.teams = state.teams;
    this.clubs = state.clubs;
    this.clubRequests = state.clubRequests || [];
    this.saveLocal(STORAGE_KEYS.EVENTS, this.events);
    this.saveLocal(STORAGE_KEYS.TEAMS, this.teams);
    this.saveLocal(STORAGE_KEYS.CLUBS, this.clubs);
    this.saveLocal(STORAGE_KEYS.CLUB_REQUESTS, this.clubRequests);
  }

  cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  statesEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  mergeCollection(baseCollection, localCollection, remoteCollection) {
    const base = new Map(baseCollection.map(item => [item.id, item]));
    const local = new Map(localCollection.map(item => [item.id, item]));
    const remote = new Map(remoteCollection.map(item => [item.id, item]));
    const ids = [...local.keys(), ...remote.keys()];
    const uniqueIds = [...new Set(ids)];

    return uniqueIds.reduce((merged, id) => {
      const baseItem = base.get(id);
      const localItem = local.get(id);
      const remoteItem = remote.get(id);
      const localChanged = !this.statesEqual(localItem, baseItem);
      const remoteChanged = !this.statesEqual(remoteItem, baseItem);

      let selected;
      if (!localChanged) selected = remoteItem;
      else if (!remoteChanged) selected = localItem;
      else if (!localItem || !remoteItem) selected = localItem;
      else selected = { ...remoteItem, ...localItem };

      if (selected) merged.push(selected);
      return merged;
    }, []);
  }

  mergeStates(baseState, localState, remoteState) {
    return {
      events: this.mergeCollection(baseState.events, localState.events, remoteState.events),
      teams: this.mergeCollection(baseState.teams, localState.teams, remoteState.teams),
      clubs: this.mergeCollection(baseState.clubs, localState.clubs, remoteState.clubs),
      clubRequests: this.mergeCollection(baseState.clubRequests || [], localState.clubRequests || [], remoteState.clubRequests || [])
    };
  }

  notifySharedDataChanged() {
    window.dispatchEvent(new CustomEvent('storage-manager-updated'));
  }

  getSupabaseClient() {
    if (this.supabaseClient) return this.supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('La libreria Supabase non è stata caricata.');
    }
    this.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return this.supabaseClient;
  }

  async startSharedSync() {
    if (this.syncStarted) return;
    this.syncStarted = true;
    try {
      this.getSupabaseClient();
      await this.fetchSharedState(true);
      if (!this.remoteEnabled) return;
      this.subscribeToSharedState();

      window.addEventListener('focus', () => {
        if (!this.remoteSyncPending && !this.remoteSyncInFlight) this.fetchSharedState(false);
      });
    } catch (error) {
      this.remoteEnabled = false;
      console.warn('Sincronizzazione Supabase non disponibile:', error.message);
    }
  }

  async fetchSharedState(migrateLocalData) {
    try {
      const { data, error } = await this.getSupabaseClient()
        .from(SUPABASE_STATE_TABLE)
        .select('state, version')
        .eq('id', SUPABASE_STATE_ID)
        .single();
      if (error) throw error;

      const sharedState = data && data.state;
      if (!sharedState || !Array.isArray(sharedState.events) || !Array.isArray(sharedState.teams) || !Array.isArray(sharedState.clubs)) {
        throw new Error('Formato dei dati condivisi non valido.');
      }

      this.remoteEnabled = true;
      this.remoteVersion = Number.isInteger(data.version) ? data.version : null;
      const localState = this.getSharedState();
      if (migrateLocalData && !this.hasSharedData(sharedState) && this.hasSharedData(localState)) {
        await this.pushSharedState();
        return true;
      }

      const dataChanged = JSON.stringify(sharedState) !== JSON.stringify(localState);
      if (dataChanged) {
        this.applySharedState(sharedState);
        this.lastSharedState = this.cloneState(this.getSharedState());
        this.notifySharedDataChanged();
      } else {
        this.lastSharedState = this.cloneState(sharedState);
      }
      return true;
    } catch (error) {
      this.remoteEnabled = false;
      throw error;
    }
  }

  subscribeToSharedState() {
    this.getSupabaseClient()
      .channel('beyside-state-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: SUPABASE_STATE_TABLE,
        filter: `id=eq.${SUPABASE_STATE_ID}`
      }, payload => {
        if (this.remoteSyncPending || this.remoteSyncInFlight) return;
        const nextState = payload.new && payload.new.state;
        if (!nextState || !Array.isArray(nextState.events) || !Array.isArray(nextState.teams) || !Array.isArray(nextState.clubs)) return;

        const dataChanged = !this.statesEqual(nextState, this.getSharedState());
        this.remoteVersion = payload.new.version;
        this.lastSharedState = this.cloneState(nextState);
        if (dataChanged) {
          this.applySharedState(nextState);
          this.notifySharedDataChanged();
        }
      })
      .subscribe();
  }

  queueRemoteSync() {
    if (!this.remoteEnabled) return;
    this.remoteSyncPending = true;
    window.clearTimeout(this.remoteSaveTimer);
    this.remoteSaveTimer = window.setTimeout(() => this.pushSharedState(), 250);
  }

  async pushSharedState() {
    if (!this.remoteEnabled || this.remoteSyncInFlight) return;
    this.remoteSyncPending = false;
    this.remoteSyncInFlight = true;
    try {
      const stateToSave = this.cloneState(this.getSharedState());
      const versionToSave = this.remoteVersion;
      if (!Number.isInteger(versionToSave)) throw new Error('Versione dei dati condivisi non disponibile.');

      const { data, error } = await this.getSupabaseClient()
        .from(SUPABASE_STATE_TABLE)
        .update({
          state: stateToSave,
          version: versionToSave + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', SUPABASE_STATE_ID)
        .eq('version', versionToSave)
        .select('state, version');
      if (error) throw error;

      if (!data || data.length === 0) {
        await this.resolveWriteConflict();
        return;
      }

      this.lastSharedState = this.cloneState(data[0].state);
      this.remoteVersion = data[0].version;
    } catch (error) {
      this.remoteEnabled = false;
      this.remoteSyncPending = true;
      console.warn('Impossibile salvare su Supabase:', error.message);
    } finally {
      this.remoteSyncInFlight = false;
      if (this.remoteSyncPending && this.remoteEnabled) this.queueRemoteSync();
    }
  }

  async resolveWriteConflict() {
    const { data, error } = await this.getSupabaseClient()
      .from(SUPABASE_STATE_TABLE)
      .select('state, version')
      .eq('id', SUPABASE_STATE_ID)
      .single();
    if (error) throw error;

    const latestState = data.state;
    if (!latestState || !Array.isArray(latestState.events) || !Array.isArray(latestState.teams) || !Array.isArray(latestState.clubs)) {
      throw new Error('Conflitto dati non risolvibile.');
    }
    const mergedState = this.mergeStates(
      this.lastSharedState || latestState,
      this.getSharedState(),
      latestState
    );
    this.applySharedState(mergedState);
    this.lastSharedState = this.cloneState(latestState);
    this.remoteVersion = data.version;
    this.remoteSyncPending = true;
  }

  /* CLUBS MANAGEMENT */
  getClubs() {
    return this.clubs || [];
  }

  addClub({ name, city, leaderNickname, email, accessKey, logoUrl }) {
    const newClub = {
      id: 'club-' + Date.now(),
      name,
      city: city || '',
      leaderNickname: leaderNickname || '',
      email: email || '',
      accessKey: accessKey || '',
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

  getClubById(id) {
    return (this.clubs || []).find(c => c.id === id);
  }

  getClubByName(name) {
    return (this.clubs || []).find(c => c.name && c.name.trim().toLowerCase() === (name || '').trim().toLowerCase());
  }

  updateClubLeaderDetails(clubId, { leaderNickname, city }) {
    const club = this.getClubById(clubId);
    if (club) {
      if (leaderNickname !== undefined) club.leaderNickname = leaderNickname;
      if (city !== undefined) club.city = city;
      this.saveClubs();
      if (this.adminSession && this.adminSession.clubId === clubId) {
        if (leaderNickname !== undefined) this.adminSession.leaderNickname = leaderNickname;
        if (city !== undefined) this.adminSession.city = city;
        this.saveLocal(STORAGE_KEYS.ADMIN_SESSION, this.adminSession);
      }
      return { success: true, club };
    }
    return { success: false, message: 'Club non trovato.' };
  }

  updateClubLeaderNickname(clubId, newNickname) {
    return this.updateClubLeaderDetails(clubId, { leaderNickname: newNickname });
  }

  /* CLUB REQUESTS MANAGEMENT */
  getClubRequests() {
    return this.clubRequests || [];
  }

  addClubRequest({ clubName, city, leaderNickname, email, notes }) {
    const newRequest = {
      id: 'req-' + Date.now(),
      clubName,
      city: city || '',
      leaderNickname: leaderNickname || '',
      email: email || '',
      notes: notes || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    if (!this.clubRequests) this.clubRequests = [];
    this.clubRequests.unshift(newRequest);
    this.saveClubRequests();
    return newRequest;
  }

  approveClubRequest(reqId) {
    const req = (this.clubRequests || []).find(r => r.id === reqId);
    if (!req) return { success: false, message: 'Richiesta non trovata.' };

    let existingClub = this.getClubByName(req.clubName);
    let accessKey = req.generatedKey || (existingClub ? existingClub.accessKey : '');

    if (!accessKey) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < 8; i++) {
        accessKey += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    let targetClub = existingClub;
    if (!targetClub) {
      targetClub = {
        id: 'club-' + Date.now(),
        name: req.clubName,
        city: req.city || '',
        leaderNickname: req.leaderNickname || '',
        email: req.email || '',
        accessKey: accessKey,
        logoUrl: req.clubName.substring(0, 1).toUpperCase()
      };
      this.clubs.unshift(targetClub);
      this.saveClubs();
    } else {
      if (!targetClub.accessKey) {
        targetClub.accessKey = accessKey;
        this.saveClubs();
      }
      if (!targetClub.leaderNickname && req.leaderNickname) {
        targetClub.leaderNickname = req.leaderNickname;
        this.saveClubs();
      }
      if (!targetClub.city && req.city) {
        targetClub.city = req.city;
        this.saveClubs();
      }
      if (!targetClub.email && req.email) {
        targetClub.email = req.email;
        this.saveClubs();
      }
    }

    req.status = 'approved';
    req.generatedKey = accessKey;
    req.approvedAt = req.approvedAt || new Date().toISOString();
    this.saveClubRequests();

    return {
      success: true,
      club: targetClub,
      leaderNickname: req.leaderNickname || targetClub.leaderNickname,
      email: req.email || targetClub.email,
      accessKey: accessKey
    };
  }

  rejectClubRequest(reqId) {
    this.clubRequests = (this.clubRequests || []).filter(r => r.id !== reqId && (r.clubName || '').trim().toLowerCase() !== 'prova');
    this.saveClubRequests();
    return { success: true };
  }

  deleteClubRequest(reqId) {
    return this.rejectClubRequest(reqId);
  }

  /* ADMIN / CLUB LEADER AUTHENTICATION */
  loginAdminOrClub(username, password) {
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (cleanUser.toLowerCase() === 'admin' && cleanPass.toLowerCase() === 'beyside') {
      this.adminSession = { role: 'admin' };
      this.saveLocal(STORAGE_KEYS.ADMIN_SESSION, this.adminSession);
      return { success: true, role: 'admin' };
    }

    const club = this.getClubByName(cleanUser);
    if (club && club.accessKey && club.accessKey.trim().toUpperCase() === cleanPass.toUpperCase()) {
      this.adminSession = {
        role: 'club_leader',
        clubId: club.id,
        clubName: club.name,
        leaderNickname: club.leaderNickname || '',
        city: club.city || ''
      };
      this.saveLocal(STORAGE_KEYS.ADMIN_SESSION, this.adminSession);
      return { success: true, role: 'club_leader', club: club };
    }

    return { success: false, message: 'Username o password non validi.' };
  }

  getCurrentAdminSession() {
    return this.adminSession || null;
  }

  logoutAdminSession() {
    this.adminSession = null;
    localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
  }

  /* TEAM ACCOUNT & AUTHENTICATION */
  registerTeamAccount({ email, password, teamName, tag, captain, city, iconUrl }) {
    const existing = this.teams.find(t => t.email && t.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, message: 'Un account con questa email esiste già.' };
    }

    const cleanTag = (tag || '').trim().toUpperCase();
    if (cleanTag.length !== 3) {
      return { success: false, message: 'Il TAG deve essere esattamente 3 lettere.' };
    }

    const newTeam = {
      id: 'team-' + Date.now(),
      name: teamName,
      tag: cleanTag,
      captain: captain || 'Capitano',
      email: email.toLowerCase(),
      password: password,
      city: city || '',
      iconUrl: iconUrl || cleanTag.substring(0, 1) || teamName.substring(0, 1),
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
    localStorage.removeItem(STORAGE_KEYS.CLUB_REQUESTS);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
    this.events = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
    this.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
    this.clubs = JSON.parse(JSON.stringify(DEFAULT_CLUBS));
    this.clubRequests = JSON.parse(JSON.stringify(DEFAULT_CLUB_REQUESTS));
    this.currentTeamId = null;
    this.adminSession = null;
    this.saveEvents();
    this.saveTeams();
    this.saveClubs();
    this.saveClubRequests();
  }
}

window.storageManager = new StorageManager();
