const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const URL = 'https://swap.ca/fr/products/canada-ro-nomination-whv.json';
const FILE_PATH = path.join(__dirname, 'last_update.txt');

async function checkUpdate() {
  try {
    // ---- BLOC DE TEST ---- 

    if (process.env.FORCE_EMAIL === 'true') {
      console.log('🧪 MODE TEST ACTIVÉ : Envoi forcé du mail.')

      await sendNotification('TEST DE FONCTIONNEMENT - Le système est opérationnel !');
      return;
    }
    // 1. Récupérer le JSON en ligne
    console.log('🔍 Vérification du timestamp...');
    const response = await axios.get(URL);
    const currentUpdatedAt = response.data.product.updated_at;

    console.log(`Date actuelle sur le site : ${currentUpdatedAt}`);

    // 2. Lire la dernière date connue (si le fichier existe)
    let lastKnownDate = '';
    if (fs.existsSync(FILE_PATH)) {
      lastKnownDate = fs.readFileSync(FILE_PATH, 'utf8').trim();
    }

    // 3. Comparer
    if (currentUpdatedAt !== lastKnownDate) {
      console.log('🚨 CHANGEMENT DÉTECTÉ !');

      // A. On envoie le mail
      await sendNotification(currentUpdatedAt);

      // B. On met à jour le fichier localement (GitHub s'occupera de sauvegarder ça)
      fs.writeFileSync(FILE_PATH, currentUpdatedAt);
      console.log('Fichier last_update.txt mis à jour.');

    } else {
      console.log('✅ Aucune modification (Dates identiques).');
    }

  } catch (error) {
    console.error('Erreur :', error);
  }
}

async function sendNotification(newDate) {

  const destinataires = process.env.RECIPIENTS || process.env.GMAIL_USER;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: destinataires,
    subject: '🚨 SWAP.CA : FICHE MISE À JOUR !',
    text: `La date de mise à jour du produit a changé !\n\nNouvelle date : ${newDate}\n\nC'est le moment d'aller voir : https://swap.ca/fr/products/canada-ro-nomination-whv`,
  };

  await transporter.sendMail(mailOptions);
  console.log('Mail envoyé.');
}

checkUpdate();


