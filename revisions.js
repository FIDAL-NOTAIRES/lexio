/* LEXIO — revisions.js (lot 2, arbitrage du 27/10/2026) : nos modifications portées dans le Word du confrère,
   en SUIVI DES RÉVISIONS, au nom de l'auteur saisi dans LEXIO. Rien n'est accepté d'office : le notaire relit
   dans Word, accepte ou retouche, puis joint ce Word au mail de synthèse.
   - paragraphes(xml)  : liste numérotée des paragraphes du corps (texte visible : insertions du confrère comprises,
                         ses suppressions exclues) ; un paragraphe « complexe » (lien, champ, contrôle de contenu…)
                         est signalé et ne sera jamais modifié par l'outil ;
   - appliquer(xml, modifs, auteur, date) : modifs = [{ p, mode: 'remplacer' | 'ajouter_apres', nouveau }] ;
     « remplacer » ne marque que la partie qui change (préfixe et suffixe communs gardés, coupés à la frontière d'un mot) ;
     « ajouter_apres » insère un nouveau paragraphe, marqué comme ajouté, après le paragraphe p.
     Rend { xml, faites: [indices], refusees: [{ p, motif }] }.
   Fonctionne dans le navigateur (DOMParser) et sous Node pour les essais (DOMParser et XMLSerializer fournis). */
(function (racine) {
  'use strict';
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var COMPLEXES = { 'w:hyperlink': 1, 'w:sdt': 1, 'w:fldSimple': 1, 'w:smartTag': 1, 'w:customXml': 1, 'w:moveFrom': 1, 'w:moveTo': 1 };

  function enfants(n) { var l = []; for (var e = n.firstChild; e; e = e.nextSibling) if (e.nodeType === 1) l.push(e); return l; }
  function texteRun(r) {
    var s = '';
    enfants(r).forEach(function (e) {
      if (e.nodeName === 'w:t') s += e.textContent;
      else if (e.nodeName === 'w:tab') s += '\t';
      else if (e.nodeName === 'w:br' || e.nodeName === 'w:cr') s += '\n';
      else if (e.nodeName === 'w:noBreakHyphen') s += '-';
    });
    return s;
  }
  // run « simple » : propriétés et texte seulement (coupable à n'importe quel signe)
  function runSimple(r) { return enfants(r).every(function (e) { return e.nodeName === 'w:rPr' || e.nodeName === 'w:t'; }); }

  /* Les runs visibles d'un paragraphe, dans l'ordre : runs directs et runs des insertions du confrère.
     Les suppressions du confrère sont ignorées (texte non visible). */
  function analyser(p) {
    var runs = [], complexe = false;
    enfants(p).forEach(function (e) {
      var nom = e.nodeName;
      if (nom === 'w:r') runs.push({ r: e, parent: p });
      else if (nom === 'w:ins') enfants(e).forEach(function (x) { if (x.nodeName === 'w:r') runs.push({ r: x, parent: e }); else if (x.nodeType === 1) complexe = true; });
      else if (COMPLEXES[nom]) { if (/\S/.test(e.textContent)) complexe = true; }
    });
    var pos = 0;
    runs.forEach(function (x) { x.texte = texteRun(x.r); x.debut = pos; pos += x.texte.length; x.fin = pos; });
    return { runs: runs, texte: runs.map(function (x) { return x.texte; }).join(''), complexe: complexe };
  }
  function corpsDe(doc) { return doc.getElementsByTagName('w:body')[0]; }
  function tousParagraphes(doc) {
    var b = corpsDe(doc); if (!b) return [];
    var ps = b.getElementsByTagName('w:p'), l = [];
    for (var i = 0; i < ps.length; i++) l.push(ps[i]);
    return l;
  }
  function paragraphes(xml, P) {
    var doc = new (P || DOMParser)().parseFromString(xml, 'application/xml');
    return tousParagraphes(doc).map(function (p, i) {
      var a = analyser(p); return { p: i, texte: a.texte, complexe: a.complexe, revise: p.getElementsByTagName('w:ins').length + p.getElementsByTagName('w:del').length > 0 };
    });
  }

  var MOT = /[\p{L}\p{N}]/u;   // une lettre ou un chiffre : on ne coupe jamais à l'intérieur d'un mot ou d'un nombre
  /* préfixe et suffixe communs, coupés à une frontière de mot pour une marque lisible */
  function bornes(ancien, nouveau) {
    var n = Math.min(ancien.length, nouveau.length), a = 0;
    while (a < n && ancien[a] === nouveau[a]) a++;
    while (a > 0 && MOT.test(ancien[a - 1]) && a < ancien.length && MOT.test(ancien[a])) a--;
    var b = 0;
    while (b < n - a && ancien[ancien.length - 1 - b] === nouveau[nouveau.length - 1 - b]) b++;
    while (b > 0 && MOT.test(ancien[ancien.length - b]) && ancien.length - b - 1 >= 0 && MOT.test(ancien[ancien.length - b - 1])) b--;
    if (a + b > ancien.length) b = ancien.length - a;
    if (a + b > nouveau.length) b = nouveau.length - a;
    return { debut: a, finAncien: ancien.length - b, finNouveau: nouveau.length - b };
  }

  function creer(doc, nom) { return doc.createElementNS(W, nom); }
  function marque(doc, nom, ctx) {
    var m = creer(doc, nom);
    m.setAttribute('w:id', String(ctx.id++)); m.setAttribute('w:author', ctx.auteur); m.setAttribute('w:date', ctx.date);
    return m;
  }
  function nouveauRun(doc, modele, texte) {
    var r = creer(doc, 'w:r');
    var rPr = modele && enfants(modele).filter(function (e) { return e.nodeName === 'w:rPr'; })[0];
    if (rPr) r.appendChild(rPr.cloneNode(true));
    var t = creer(doc, 'w:t'); t.setAttribute('xml:space', 'preserve'); t.textContent = texte; r.appendChild(t);
    return r;
  }
  // coupe un run simple à la position k (relative au run) : le run garde la tête, un clone reçoit la queue, placé juste après
  function couper(doc, x, k) {
    var t = enfants(x.r).filter(function (e) { return e.nodeName === 'w:t'; });
    var tout = x.texte, tete = tout.slice(0, k), queue = tout.slice(k);
    var clone = x.r.cloneNode(true);
    t.forEach(function (e, i) { if (i) x.r.removeChild(e); });
    if (t[0]) { t[0].textContent = tete; t[0].setAttribute('xml:space', 'preserve'); }
    var tc = enfants(clone).filter(function (e) { return e.nodeName === 'w:t'; });
    tc.forEach(function (e, i) { if (i) clone.removeChild(e); });
    if (tc[0]) { tc[0].textContent = queue; tc[0].setAttribute('xml:space', 'preserve'); }
    x.parent.insertBefore(clone, x.r.nextSibling);
    return { r: clone, parent: x.parent, texte: queue, debut: x.debut + k, fin: x.fin };
  }
  function enSuppression(doc, x, ctx) {
    enfants(x.r).forEach(function (e) {
      if (e.nodeName === 'w:t') { var d = creer(doc, 'w:delText'); d.setAttribute('xml:space', 'preserve'); d.textContent = e.textContent; x.r.replaceChild(d, e); }
      else if (e.nodeName === 'w:instrText') { var di = creer(doc, 'w:delInstrText'); di.textContent = e.textContent; x.r.replaceChild(di, e); }
    });
    var del = marque(doc, 'w:del', ctx);
    x.parent.replaceChild(del, x.r); del.appendChild(x.r);
    return del;
  }
  // nœud de niveau paragraphe qui porte le run (le run lui-même, ou l'insertion du confrère qui le contient)
  function niveauParagraphe(p, n) { while (n.parentNode && n.parentNode !== p) n = n.parentNode; return n; }

  function remplacer(doc, p, nouveau, ctx) {
    var a = analyser(p);
    if (a.complexe) return 'paragraphe avec lien, champ ou contrôle de contenu : à porter à la main';
    if (!a.runs.length) return 'paragraphe sans texte';
    var ancien = a.texte;
    if (ancien === nouveau) return 'aucune différence';
    var bo = bornes(ancien, nouveau), runs = a.runs;
    // coupe aux deux bornes quand elles tombent à l'intérieur d'un run simple ; sinon la borne s'élargit au run entier
    function couperA(pos, versLaFin) {
      for (var i = 0; i < runs.length; i++) {
        var x = runs[i];
        if (pos > x.debut && pos < x.fin) {
          if (runSimple(x.r)) { var q = couper(doc, x, pos - x.debut); x.fin = pos; x.texte = x.texte.slice(0, pos - x.debut); runs.splice(i + 1, 0, q); return pos; }
          return versLaFin ? x.fin : x.debut;
        }
      }
      return pos;
    }
    var d = couperA(bo.debut, false);
    var f = couperA(bo.finAncien, true);
    var depart = d, arrivee = f;
    // le texte inséré correspond à la zone réellement supprimée (bornes élargies comprises)
    var insere = nouveau.slice(depart, nouveau.length - (ancien.length - arrivee));
    var aSupprimer = runs.filter(function (x) { return x.debut >= depart && x.fin <= arrivee && x.fin > x.debut; });
    var apres = null, modele = null;
    aSupprimer.forEach(function (x) { modele = modele || x.r; apres = enSuppression(doc, x, ctx); });
    if (!modele) {
      // insertion pure : placée après le dernier run qui précède la position
      var avant = runs.filter(function (x) { return x.fin <= depart; }).pop();
      modele = avant ? avant.r : runs[0].r;
      apres = avant ? avant.r : null;
    }
    if (insere) {
      var ins = marque(doc, 'w:ins', ctx); ins.appendChild(nouveauRun(doc, modele, insere));
      if (apres) { var lieu = niveauParagraphe(p, apres); p.insertBefore(ins, lieu.nextSibling); }
      else { var premier = niveauParagraphe(p, runs[0].r); p.insertBefore(ins, premier); }
    }
    return null;
  }
  function ajouterApres(doc, p, nouveau, ctx) {
    var a = analyser(p);
    var np = creer(doc, 'w:p');
    var pPr = enfants(p).filter(function (e) { return e.nodeName === 'w:pPr'; })[0];
    var npPr = pPr ? pPr.cloneNode(true) : creer(doc, 'w:pPr');
    var rPr = enfants(npPr).filter(function (e) { return e.nodeName === 'w:rPr'; })[0];
    if (!rPr) { rPr = creer(doc, 'w:rPr'); npPr.appendChild(rPr); }
    enfants(rPr).forEach(function (e) { if (e.nodeName === 'w:ins' || e.nodeName === 'w:del') rPr.removeChild(e); });
    rPr.appendChild(marque(doc, 'w:ins', ctx));   // la marque de paragraphe elle-même est ajoutée
    np.appendChild(npPr);
    var ins = marque(doc, 'w:ins', ctx); ins.appendChild(nouveauRun(doc, a.runs[0] ? a.runs[0].r : null, nouveau)); np.appendChild(ins);
    p.parentNode.insertBefore(np, p.nextSibling);
    return null;
  }

  function appliquer(xml, modifs, auteur, date, P, S) {
    var doc = new (P || DOMParser)().parseFromString(xml, 'application/xml');
    var ps = tousParagraphes(doc);
    var ctx = { id: 940000, auteur: String(auteur || 'FIDAL Notaires').slice(0, 100), date: date || new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
    var faites = [], refusees = [];
    // du dernier paragraphe au premier, pour que les ajouts ne décalent pas les indices suivants
    (modifs || []).slice().sort(function (x, y) { return y.p - x.p; }).forEach(function (m) {
      var p = ps[m.p], nouveau = String(m.nouveau || '').replace(/\r/g, '');
      if (!p) return refusees.push({ p: m.p, motif: 'paragraphe introuvable' });
      if (!nouveau.trim()) return refusees.push({ p: m.p, motif: 'texte proposé vide' });
      var motif = m.mode === 'ajouter_apres' ? ajouterApres(doc, p, nouveau, ctx) : remplacer(doc, p, nouveau, ctx);
      if (motif) refusees.push({ p: m.p, motif: motif }); else faites.push(m.p);
    });
    return { xml: new (S || XMLSerializer)().serializeToString(doc), faites: faites.sort(function (a, b) { return a - b; }), refusees: refusees };
  }

  var api = { paragraphes: paragraphes, appliquer: appliquer, _bornes: bornes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.LexioRevisions = api;
})(typeof window !== 'undefined' ? window : this);
