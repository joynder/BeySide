# BeySide

## Dati condivisi tra dispositivi

Il sito non va aperto con `file://` né pubblicato su GitHub Pages: entrambi sono statici e non possono scrivere i dati del torneo. Avvialo invece nella cartella del progetto con Node.js 18 o successivo:

```powershell
npm start
```

Apri `http://localhost:3000`. Dagli altri dispositivi collegati alla stessa rete apri `http://IP-DEL-COMPUTER:3000` (consentendo la porta 3000 nel firewall di Windows, se richiesta).

Ogni modifica viene salvata dal server nei file `data/events.json`, `data/teams.json` e `data/clubs.json` dentro questa cartella Git. Gli altri dispositivi aggiornano automaticamente i dati entro pochi secondi o quando tornano alla pagina.

Le modifiche ai JSON restano modifiche locali del repository: usa normalmente Git per verificarle, farne il commit e inviarle quando desideri conservarne una versione nel remoto.
