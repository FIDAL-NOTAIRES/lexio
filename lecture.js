/* SUIVI — lecture d'un mail glissé depuis Outlook (.eml ou .msg), sur le poste,
   sans rien envoyer ailleurs, et proposition de fiche dossier.
   Le texte du mail n'est jamais enregistré : seuls l'objet, l'expéditeur,
   la date et les adresses servent à la fiche et à la chronologie. */
(function (racine) {
  'use strict';

  var MOI = 'jean-francois.dumetz@fidal.notaires.fr';
  var DOMAINE_CABINET = '@fidal.notaires.fr';
  var MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

  function sansAccent(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function deux(n) { return String(n).padStart(2, '0'); }

  /* ---------- .eml (format texte MIME) ---------- */
  function decoderOctets(octets, charset) {
    try { return new TextDecoder(normCharset(charset)).decode(octets); }
    catch (e) { return new TextDecoder('windows-1252').decode(octets); }
  }
  function normCharset(c) { c = (c || 'utf-8').toLowerCase().replace(/["']/g, ''); return c === 'us-ascii' ? 'utf-8' : c; }
  function binaire(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function base64(s) { try { return binaire(atob(s.replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return new Uint8Array(0); } }
  function qp(s, entete) {
    if (entete) s = s.replace(/_/g, ' ');
    s = s.replace(/=\r?\n/g, '');
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out.push(s.charCodeAt(i) & 255);
    }
    return new Uint8Array(out);
  }
  // en-têtes encodés (RFC 2047) : =?utf-8?B?…?= ou =?iso-8859-1?Q?…?=
  function decoderEntete(v) {
    return (v || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, function (_, cs, enc, txt) {
      return decoderOctets(enc.toUpperCase() === 'B' ? base64(txt) : qp(txt, true), cs);
    });
  }
  function separer(brut) {
    var i = brut.search(/\r?\n\r?\n/);
    var tete = i < 0 ? brut : brut.slice(0, i), corps = i < 0 ? '' : brut.slice(i).replace(/^\r?\n\r?\n/, '');
    var entetes = {};
    tete.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (l) {
      var m = l.match(/^([\w-]+):\s*(.*)$/); if (m) { var k = m[1].toLowerCase(); if (!(k in entetes)) entetes[k] = m[2]; }
    });
    return { entetes: entetes, corps: corps };
  }
  function param(v, nom) { var m = (v || '').match(new RegExp(nom + '\\s*=\\s*"?([^";]+)"?', 'i')); return m ? m[1] : null; }
  function texteDePartie(p) {
    var type = (p.entetes['content-type'] || 'text/plain').toLowerCase();
    if (type.indexOf('multipart/') === 0) {
      var borne = param(p.entetes['content-type'], 'boundary'); if (!borne) return null;
      var morceaux = p.corps.split('--' + borne).slice(1).filter(function (x) { return !/^--/.test(x); }).map(function (x) { return separer(x.replace(/^\r?\n/, '')); });
      var html = null;
      for (var i = 0; i < morceaux.length; i++) {
        var t = texteDePartie(morceaux[i]);
        if (t && t.type === 'plain') return t;
        if (t && t.type === 'html' && !html) html = t;
      }
      return html;
    }
    if (type.indexOf('text/') !== 0) return null;
    var enc = (p.entetes['content-transfer-encoding'] || '').toLowerCase().trim();
    var octets = enc === 'base64' ? base64(p.corps) : enc === 'quoted-printable' ? qp(p.corps) : binaire(p.corps);
    var txt = decoderOctets(octets, param(p.entetes['content-type'], 'charset'));
    return type.indexOf('text/html') === 0 ? { type: 'html', texte: depuisHtml(txt) } : { type: 'plain', texte: txt };
  }
  function depuisHtml(h) {
    return h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’')
      .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&ccedil;/g, 'ç').replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô');
  }
  function adressesDe(v) {
    var liste = [];
    decoderEntete(v || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).forEach(function (x) {
      var m = x.match(/<([^>]+)>/), adr = (m ? m[1] : x).trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adr)) liste.push({ nom: (m ? x.replace(/<[^>]+>/, '') : '').replace(/["']/g, '').trim(), adresse: adr });
    });
    return liste;
  }
  function lireEml(octets) {
    var brut = '';
    for (var i = 0; i < octets.length; i += 8192) brut += String.fromCharCode.apply(null, octets.subarray(i, i + 8192));
    var p = separer(brut), e = p.entetes, t = texteDePartie(p);
    var de = adressesDe(e.from)[0] || { nom: '', adresse: '' };
    var d = e.date ? new Date(e.date) : null;
    return {
      objet: decoderEntete(e.subject || '').trim(), de: de,
      a: adressesDe(e.to), cc: adressesDe(e.cc),
      date: d && !isNaN(d) ? d : null, texte: t ? t.texte : ''
    };
  }

  /* ---------- .msg (format binaire d'Outlook) ---------- */
  function lireMsg(octets, Lecteur) {
    var L = Lecteur || racine.MsgReader;
    if (!L) throw new Error('Lecteur .msg indisponible.');
    var r = new L(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)).getFileData();
    if (r.error) throw new Error('Fichier .msg illisible.');
    function smtp(x) {
      var a = (x.smtpAddress || x.email || '').toLowerCase();
      return /@/.test(a) ? a : '';
    }
    var a = [], cc = [];
    (r.recipients || []).forEach(function (x) {
      var o = { nom: x.name || '', adresse: smtp(x) }; if (!o.adresse) return;
      (x.recipType === 'cc' ? cc : a).push(o);
    });
    var d = r.messageDeliveryTime || r.clientSubmitTime || r.creationTime;
    d = d ? new Date(d) : null;
    var expediteur = (r.senderSmtpAddress || r.senderEmail || '').toLowerCase();
    if (!/@/.test(expediteur) && r.headers) { var m = r.headers.match(/^From:.*<([^>]+)>/mi); if (m) expediteur = m[1].toLowerCase(); }
    return {
      objet: (r.subject || '').trim(), de: { nom: r.senderName || '', adresse: /@/.test(expediteur) ? expediteur : '' },
      a: a, cc: cc, date: d && !isNaN(d) ? d : null, texte: r.body || (r.bodyHtml ? depuisHtml(r.bodyHtml) : '')
    };
  }

  function lireOctets(nom, octets, Lecteur) {
    var signature = octets[0] === 0xD0 && octets[1] === 0xCF && octets[2] === 0x11 && octets[3] === 0xE0;
    if (signature || /\.msg$/i.test(nom || '')) return lireMsg(octets, Lecteur);
    return lireEml(octets);
  }

  /* ---------- Proposition de fiche ---------- */
  function nettoyerObjet(o) {
    var s = (o || '').replace(/\[(ext|externe|external)\]/ig, ' ');
    var avant;
    do { avant = s; s = s.replace(/^\s*((re|tr|fw|fwd|réf|ref|rép|aw|wg)\s*(\[\d+\])?\s*:\s*)/i, ''); } while (s !== avant);
    return s.replace(/\s+/g, ' ').trim();
  }
  var MOTS_TETE = /^(projet\s+d[e']\s*|projet\s+|dossier\s+|vente\s+|cession\s+|acquisition\s+|acte\s+(de\s+vente\s+)?|promesse\s+(de\s+vente\s+)?|compromis\s+(de\s+vente\s+)?|avant[- ]contrat\s+|signature\s+|réitération\s+|reiteration\s+|donation\s+|partage\s+|bail\s+(commercial\s+)?)+/i;
  function propre(n) {
    return (n || '').replace(/\b(n°|no|réf\.?|ref\.?)\s*[:#]?\s*[\w\-\/\.]+/ig, '').replace(/\b20\d{2}[-\/]\d{1,5}\b/g, '')
      .replace(/[«»"()\[\]]/g, ' ').replace(/^[\s\-–:,]+|[\s\-–:,.]+$/g, '').replace(/\s+/g, ' ').trim();
  }
  function parties(objet) {
    var s = objet.replace(MOTS_TETE, '');
    var m;
    if ((m = s.match(/^(succession\s+.+?)(?:\s+[-–:]\s+.*)?$/i))) return [propre(m[1]), null];
    if ((m = s.match(/^(.+?)\s*(?:\/|\bc\/|\bcontre\b|\s[-–]\s)\s*(.+)$/i))) return [propre(m[1]), propre(m[2].split(/\s[-–:]\s/)[0])];
    if ((m = s.match(/^(.+?)\s+(?:à|au profit de|vers)\s+(.+)$/i))) return [propre(m[1]), propre(m[2].split(/\s[-–:]\s/)[0])];
    return [propre(s.split(/\s[-–:]\s/)[0]), null];
  }
  function numero(texte) {
    var m = texte.match(/\b(?:dossier|n°|no\.?|réf\.?|ref\.?|référence|reference)\s*[:#]?\s*((?=[A-Z0-9\-\/\.]*\d)[A-Z0-9][A-Z0-9\-\/\.]{2,19})\b/i);
    if (m) return m[1];
    m = texte.match(/\b(20\d{2}-\d{1,5})\b/);
    return m ? m[1] : null;
  }
  // Date de signature : la première date à venir citée près du mot « signature » (ou « signer », « rendez-vous de signature »)
  function signature(texte, aujourdhui) {
    var t = sansAccent(texte).toLowerCase().replace(/\s+/g, ' ');
    var an = +aujourdhui.slice(0, 4), meilleure = null;
    var re = /sign(?:ature|er|era|erons|e)\b/g, m;
    while ((m = re.exec(t))) {
      var fenetre = t.slice(Math.max(0, m.index - 80), m.index + 160);
      var dates = [];
      fenetre.replace(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g, function (_, j, mo, a) { dates.push([+j, +mo, a ? +(a.length === 2 ? '20' + a : a) : null]); });
      fenetre.replace(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/g, function (_, j, mo, a) { dates.push([+j, MOIS[mo], a ? +a : null]); });
      dates.forEach(function (d) {
        if (d[1] < 1 || d[1] > 12 || d[0] < 1 || d[0] > 31) return;
        var a = d[2] || an, s = a + '-' + deux(d[1]) + '-' + deux(d[0]);
        if (!d[2] && s < aujourdhui) s = (a + 1) + '-' + deux(d[1]) + '-' + deux(d[0]);
        if (s >= aujourdhui && (!meilleure || s < meilleure)) meilleure = s;
      });
    }
    return meilleure;
  }

  function devinerType(t) {
    var T = racine && racine.SuiviTypes ? racine.SuiviTypes : (typeof require === 'function' ? require('./types.js') : null);
    return T ? T.deviner(t) : null;
  }
  function proposer(mail, aujourdhui, moi) {
    moi = (moi || MOI).toLowerCase();
    var objet = nettoyerObjet(mail.objet);
    var p = parties(objet);
    var tous = [mail.de].concat(mail.a || [], mail.cc || []).filter(function (x) { return x && x.adresse; });
    /* toutes les adresses de l'étude vont dans le bloc « Étude », les autres sont des correspondants */
    var collaborateur = null, adresses = [], etude = [];
    tous.forEach(function (x) {
      if (x.adresse === moi) return;
      if (x.adresse.slice(-DOMAINE_CABINET.length) === DOMAINE_CABINET) { if (etude.indexOf(x.adresse) < 0) etude.push(x.adresse); if (!collaborateur) collaborateur = x.adresse; return; }
      if (adresses.indexOf(x.adresse) < 0) adresses.push(x.adresse);
    });
    var texte = (mail.texte || '').slice(0, 20000);
    var dateMail = mail.date ? new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(mail.date) : aujourdhui;
    return {
      intitule: objet || 'Dossier sans objet',
      partie1: p[0] || '', partie2: p[1] || '',
      numero: numero(mail.objet + '\n' + texte.slice(0, 2000)) || '',
      signature_prevue: signature(objet + ' ' + texte, aujourdhui) || '',
      adresses: adresses, collaborateur: collaborateur || '', etude: etude,
      type_dossier: devinerType(objet + ' ' + texte.slice(0, 1500)) || '',
      date_ouverture: dateMail,
      etape: /\b(promesse|compromis|avant[- ]contrat)\b/i.test(objet) && /\b(r[ée]it[ée]ration|acte authentique|acte de vente)\b/i.test(objet + ' ' + texte.slice(0, 3000)) ? 'avant_contrat' : 'en_cours',
      mail: {
        objet: (mail.objet || '').trim().slice(0, 300),
        expediteur: mail.de && mail.de.adresse ? (mail.de.nom ? mail.de.nom + ' <' + mail.de.adresse + '>' : mail.de.adresse) : '',
        date: dateMail,
        apercu: texte.replace(/\s+/g, ' ').trim().slice(0, 400)
      }
    };
  }

  var api = { lireOctets: lireOctets, lireEml: lireEml, lireMsg: lireMsg, proposer: proposer, nettoyerObjet: nettoyerObjet, parties: parties, signature: signature, numero: numero };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.SuiviLecture = api;
})(this);
