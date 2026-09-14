/**
 * QUIZVERSE — OFFLINE DEMO QUESTION LIBRARY
 * ---------------------------------------------------------------------------
 * Hand-written, curriculum-grade seed content used by the demo build while the
 * live AI provider is not connected (Layer 1 stands in with a real validator).
 *
 * Every question carries: stage, difficulty, cognitive_level, concept_tag,
 * explanation, simple_explanation, clue (lifeline asset) and an illustration key.
 * `reserve: true` questions are NOT played as part of the main flow — they exist
 * for the CHANGE QUESTION lifeline (the reserve pool of §8.2 step 4).
 */

/* ------------------------------------------------------------------ */
/* PACK 1 — Hindi, Computer (Class 7)                                  */
/* ------------------------------------------------------------------ */

const packHindiComputer = {
  id: 'pack_hi_computer_c7',
  class_level: 7,
  subject: 'Computer',
  language: 'hi',
  topic: 'कंप्यूटर का परिचय और भारत का सुपर कंप्यूटर',
  title: 'कक्षा 7 – कंप्यूटर ज्ञान चैलेंज',
  aliases: ['computer', 'कंप्यूटर', 'supercomputer', 'सुपर कंप्यूटर', 'cpu', 'बूटिंग', 'computer basics', 'कंप्यूटर बेसिक्स'],
  description: 'कंप्यूटर के मुख्य भाग, मेमोरी और भारत का पहला स्वदेशी सुपर कंप्यूटर',
  questions: [
    /* ---------- STAGE 1 — very easy ---------- */
    {
      question_id: 'hi_01', stage: 1, difficulty: 'very_easy', cognitive_level: 'recall', concept_tag: 'आउटपुट डिवाइस',
      question: 'निम्न में से कौन-सा स्टोरेज डिवाइस नहीं है?',
      options: { A: 'पेन ड्राइव', B: 'मॉनिटर', C: 'रैम', D: 'हार्ड डिस्क' },
      correct_option: 'B',
      explanation: 'मॉनिटर एक आउटपुट डिवाइस है। यह डेटा, टेक्स्ट और वीडियो को स्क्रीन पर दिखाता है, डेटा स्टोर नहीं करता।',
      simple_explanation: 'मॉनिटर सिर्फ दिखाता है, कुछ याद नहीं रखता। इसलिए यह स्टोरेज डिवाइस नहीं है।',
      clue: 'यह डिवाइस जानकारी सिर्फ दिखाता है, सुरक्षित नहीं रखता।',
      illustration: 'monitor', source_reference: null,
    },
    {
      question_id: 'hi_02', stage: 1, difficulty: 'very_easy', cognitive_level: 'recall', concept_tag: 'इनपुट डिवाइस',
      question: 'कंप्यूटर में टाइप करने के लिए किस डिवाइस का उपयोग किया जाता है?',
      options: { A: 'कीबोर्ड', B: 'माउस', C: 'स्पीकर', D: 'प्रिंटर' },
      correct_option: 'A',
      explanation: 'कीबोर्ड एक इनपुट डिवाइस है। इसकी सहायता से हम अक्षर, संख्याएँ और निर्देश कंप्यूटर में लिखते हैं।',
      simple_explanation: 'कीबोर्ड से हम कंप्यूटर में लिखते हैं।',
      clue: 'इस डिवाइस पर बहुत सारी बटन-अक्षर वाली कुंजियाँ होती हैं।',
      illustration: 'keyboard', source_reference: null,
    },
    {
      question_id: 'hi_03', stage: 1, difficulty: 'very_easy', cognitive_level: 'recognition', concept_tag: 'ऑपरेटिंग सिस्टम',
      question: 'निम्न में से कौन-सा ऑपरेटिंग सिस्टम नहीं है?',
      options: { A: 'विंडोज़', B: 'लिनक्स', C: 'एंड्रॉइड', D: 'एमएस पेंट' },
      correct_option: 'D',
      explanation: 'एमएस पेंट एक ड्राइंग सॉफ्टवेयर है, ऑपरेटिंग सिस्टम नहीं। विंडोज़, लिनक्स और एंड्रॉइड ऑपरेटिंग सिस्टम हैं।',
      simple_explanation: 'पेंट से चित्र बनाते हैं; यह ऑपरेटिंग सिस्टम नहीं है।',
      clue: 'इस सॉफ्टवेयर में ब्रश और रंग मिलते हैं।',
      illustration: 'paint', source_reference: null,
    },

    /* ---------- STAGE 2 — easy ---------- */
    {
      question_id: 'hi_04', stage: 2, difficulty: 'easy', cognitive_level: 'understanding', concept_tag: 'बूटिंग',
      question: 'कंप्यूटर को चालू करने की प्रक्रिया को क्या कहते हैं?',
      options: { A: 'बूटिंग', B: 'शटडाउन', C: 'रीस्टार्ट', D: 'लॉगिन' },
      correct_option: 'A',
      explanation: 'पावर बटन दबाने पर ऑपरेटिंग सिस्टम सेकेंडरी मेमोरी से मुख्य मेमोरी (रैम) में लोड होता है। इस शुरुआती प्रक्रिया को बूटिंग कहते हैं।',
      simple_explanation: 'कंप्यूटर चालू होकर तैयार होने की प्रक्रिया = बूटिंग।',
      clue: 'यह शब्द जूते के फीते वाले अंग्रेज़ी शब्द से बना है।',
      illustration: 'cpu', source_reference: null,
    },
    {
      question_id: 'hi_05', stage: 2, difficulty: 'easy', cognitive_level: 'understanding', concept_tag: 'मेमोरी',
      question: 'कंप्यूटर बंद करने पर किस मेमोरी का डेटा मिट जाता है?',
      options: { A: 'रैम', B: 'हार्ड डिस्क', C: 'पेन ड्राइव', D: 'सीडी' },
      correct_option: 'A',
      explanation: 'रैम एक अस्थायी (प्राइमरी) मेमोरी है। बिजली जाते ही इसका डेटा मिट जाता है, जबकि हार्ड डिस्क और पेन ड्राइव का डेटा स्थायी रहता है।',
      simple_explanation: 'रैम अस्थायी है — कंप्यूटर बंद, डेटा खत्म।',
      clue: 'यह मेमोरी चालू प्रोग्राम का डेटा अस्थायी रूप से रखती है।',
      illustration: 'ram', source_reference: null,
    },
    {
      question_id: 'hi_06', stage: 2, difficulty: 'easy', cognitive_level: 'recall', concept_tag: 'मेमोरी इकाई',
      question: 'कंप्यूटर में 1 किलोबाइट (KB) कितने बाइट के बराबर होता है?',
      options: { A: '100 बाइट', B: '512 बाइट', C: '1024 बाइट', D: '2048 बाइट' },
      correct_option: 'C',
      explanation: 'कंप्यूटर बाइनरी (2 के आधार) पर चलता है। इसलिए 1 KB = 2 की घात 10 = 1024 बाइट होता है।',
      simple_explanation: 'कंप्यूटर में 1 KB = 1024 बाइट, क्योंकि वह 2 के गुणकों में गिनता है।',
      clue: 'यह संख्या 2 को दस बार गुणा करने पर आती है।',
      illustration: 'harddisk', source_reference: null,
    },

    /* ---------- STAGE 3 — medium ---------- */
    {
      question_id: 'hi_07', stage: 3, difficulty: 'medium', cognitive_level: 'understanding', concept_tag: 'ऑपरेटिंग सिस्टम',
      question: 'ऑपरेटिंग सिस्टम का मुख्य कार्य क्या है?',
      options: { A: 'चित्र बनाना', B: 'हार्डवेयर और सॉफ्टवेयर का प्रबंधन करना', C: 'गाने सुनना', D: 'केवल ई-मेल भेजना' },
      correct_option: 'B',
      explanation: 'ऑपरेटिंग सिस्टम कंप्यूटर के हार्डवेयर और सॉफ्टवेयर के बीच सेतु का काम करता है। यह मेमोरी, फाइलें और प्रोग्राम चलाना संभालता है।',
      simple_explanation: 'ऑपरेटिंग सिस्टम पूरे कंप्यूटर को चलाता और संभालता है।',
      clue: 'यह सिस्टम का प्रबंधक है, कोई एक काम करने वाला ऐप नहीं।',
      illustration: 'cpu', source_reference: null,
    },
    {
      question_id: 'hi_08', stage: 3, difficulty: 'medium', cognitive_level: 'application', concept_tag: 'MS पेंट',
      question: 'MS पेंट का मुख्य उपयोग किस लिए किया जाता है?',
      options: { A: 'प्रोग्रामिंग कोड लिखने के लिए', B: 'ई-मेल भेजने के लिए', C: 'म्यूजिक सुनने के लिए', D: 'चित्र बनाने और संपादित करने के लिए' },
      correct_option: 'D',
      explanation: 'एमएस पेंट विंडोज़ का बुनियादी ग्राफ़िक्स सॉफ्टवेयर है। इससे डिजिटल ड्राइंग बनाई जाती है, आकृतियों में रंग भरा जाता है और चित्र क्रॉप या एडिट किए जाते हैं।',
      simple_explanation: 'पेंट = चित्र बनाने और ठीक करने का सॉफ्टवेयर।',
      clue: 'इसमें ब्रश, रंग और आकृतियाँ मिलती हैं।',
      illustration: 'paint', source_reference: null,
    },
    {
      question_id: 'hi_09', stage: 3, difficulty: 'medium', cognitive_level: 'understanding', concept_tag: 'C.P.U.',
      question: 'C.P.U. का पूरा नाम क्या है?',
      options: { A: 'सेंट्रल प्रोसेसिंग यूनिट', B: 'सेंटर प्रोग्रेस यूनिट', C: 'सेंटर प्रोसेसिंग यूनिट', D: 'कंप्यूटर प्रोसेस यूनिट' },
      correct_option: 'A',
      explanation: 'C.P.U. यानी Central Processing Unit। इसे कंप्यूटर का मस्तिष्क कहा जाता है क्योंकि यह निर्देशों को प्रोसेस करता है और परिणाम तैयार करता है।',
      simple_explanation: 'CPU = कंप्यूटर का दिमाग, जो सोचता और गणना करता है।',
      clue: 'बीच वाला शब्द कोई और नहीं, प्रोसेसिंग है।',
      illustration: 'cpu', source_reference: null,
    },

    /* ---------- STAGE 4 — hard ---------- */
    {
      question_id: 'hi_10', stage: 4, difficulty: 'hard', cognitive_level: 'recall', concept_tag: 'भारत का सुपर कंप्यूटर',
      question: 'भारत का पहला स्वदेशी सुपर कंप्यूटर कौन-सा है?',
      options: { A: 'परम-8000', B: 'परम-800', C: 'परम-80', D: 'परम-8' },
      correct_option: 'A',
      explanation: 'परम-8000 भारत का पहला स्वदेशी सुपर कंप्यूटर है, जिसे 1991 में सी-डैक (C-DAC), पुणे द्वारा विकसित किया गया था।',
      simple_explanation: '1991 में सी-डैक पुणे ने परम-8000 बनाया।',
      clue: 'नाम में साल जैसा बड़ा अंक है।',
      illustration: 'supercomputer', source_reference: null,
    },
    {
      question_id: 'hi_11', stage: 4, difficulty: 'hard', cognitive_level: 'application', concept_tag: 'शॉर्टकट कुंजी',
      question: 'कंप्यूटर में Ctrl + C का क्या कार्य है?',
      options: { A: 'चयनित सामग्री को कॉपी करना', B: 'सामग्री चिपकाना', C: 'सामग्री काटना', D: 'अंतिम कार्य पूर्ववत करना' },
      correct_option: 'A',
      explanation: 'Ctrl + C चयनित सामग्री को क्लिपबोर्ड में कॉपी करता है। चिपकाने के लिए Ctrl + V, काटने के लिए Ctrl + X और पूर्ववत करने के लिए Ctrl + Z दबाया जाता है।',
      simple_explanation: 'Ctrl + C = कॉपी, Ctrl + V = पेस्ट।',
      clue: 'यह कुंजी चीज़ की एक नकल बनाती है, असली को हटाती नहीं।',
      illustration: 'keyboard', source_reference: null,
    },
    {
      question_id: 'hi_12', stage: 4, difficulty: 'hard', cognitive_level: 'reasoning', concept_tag: 'प्राइमरी और सेकेंडरी स्टोरेज',
      question: 'स्टोरेज के बारे में निम्न में से कौन-सा कथन सही है?',
      options: { A: 'रैम स्थायी मेमोरी है', B: 'हार्ड डिस्क अस्थायी मेमोरी है', C: 'रैम अस्थायी और हार्ड डिस्क स्थायी स्टोरेज है', D: 'रोम में डेटा बार-बार लिखा जा सकता है' },
      correct_option: 'C',
      explanation: 'रैम प्राइमरी और अस्थायी मेमोरी है, बिजली जाने पर इसका डेटा मिट जाता है। हार्ड डिस्क सेकेंडरी और स्थायी स्टोरेज है, जिसमें डेटा बना रहता है।',
      simple_explanation: 'रैम अस्थायी, हार्ड डिस्क स्थायी।',
      clue: 'एक मेमोरी बिजली जाने पर खाली हो जाती है, दूसरी नहीं।',
      illustration: 'harddisk', source_reference: null,
    },

    /* ---------- STAGE 5 — highest ---------- */
    {
      question_id: 'hi_13', stage: 5, difficulty: 'highest', cognitive_level: 'recall', concept_tag: 'सी-डैक',
      question: 'परम सुपर कंप्यूटर श्रृंखला को विकसित करने वाली संस्था कौन-सी है?',
      options: { A: 'सी-डैक, पुणे', B: 'इसरो, बेंगलुरु', C: 'आईआईटी, दिल्ली', D: 'बीएआरसी, मुंबई' },
      correct_option: 'A',
      explanation: 'सी-डैक (Centre for Development of Advanced Computing), पुणे ने परम श्रृंखला विकसित की। परम-8000 के बाद परम-10000, परम युवा, परम सिद्धि-एआई और परम प्रवेग जैसे मॉडल आए।',
      simple_explanation: 'परम श्रृंखला सी-डैक पुणे की देन है।',
      clue: 'यह संस्था एडवांस्ड कंप्यूटिंग के क्षेत्र में काम करती है।',
      illustration: 'supercomputer', source_reference: null,
    },
    {
      question_id: 'hi_14', stage: 5, difficulty: 'highest', cognitive_level: 'reasoning', concept_tag: 'रैम का प्रभाव',
      question: 'यदि कंप्यूटर की रैम कम हो तो सबसे संभावित परिणाम क्या होगा?',
      options: { A: 'हार्ड डिस्क का सारा डेटा मिट जाएगा', B: 'एक साथ कई प्रोग्राम चलाने पर कंप्यूटर धीमा हो जाएगा', C: 'मॉनिटर काम करना बंद कर देगा', D: 'कीबोर्ड के अक्षर बदल जाएँगे' },
      correct_option: 'B',
      explanation: 'रैम चालू प्रोग्राम का डेटा रखती है। रैम कम होने पर एक साथ कई प्रोग्राम चलाने के लिए डेटा बार-बार हार्ड डिस्क से लेना पड़ता है, जिससे कंप्यूटर धीमा हो जाता है।',
      simple_explanation: 'रैम कम = कई प्रोग्राम चलाने पर कंप्यूटर धीमा।',
      clue: 'इसका असर गति पर पड़ता है, डेटा मिटने पर नहीं।',
      illustration: 'ram', source_reference: null,
    },
    {
      question_id: 'hi_15', stage: 5, difficulty: 'highest', cognitive_level: 'understanding', concept_tag: 'कंप्यूटर की पीढ़ियाँ',
      question: 'कंप्यूटर की चौथी पीढ़ी में किसका उपयोग किया गया?',
      options: { A: 'वैक्यूम ट्यूब', B: 'ट्रांजिस्टर', C: 'इंटीग्रेटेड सर्किट', D: 'माइक्रोप्रोसेसर' },
      correct_option: 'D',
      explanation: 'पहली पीढ़ी में वैक्यूम ट्यूब, दूसरी में ट्रांजिस्टर, तीसरी में इंटीग्रेटेड सर्किट और चौथी पीढ़ी में माइक्रोप्रोसेसर का उपयोग हुआ।',
      simple_explanation: 'चौथी पीढ़ी = माइक्रोप्रोसेसर वाली पीढ़ी।',
      clue: 'यह वही चिप है जिसने कंप्यूटर को छोटा और सस्ता बनाया।',
      illustration: 'cpu', source_reference: null,
    },

    /* ---------- RESERVE POOL (CHANGE QUESTION) ---------- */
    {
      question_id: 'hi_r1', stage: 2, reserve: true, difficulty: 'easy', cognitive_level: 'recall', concept_tag: 'इनपुट डिवाइस',
      question: 'निम्न में से कौन-सा इनपुट डिवाइस है?',
      options: { A: 'माउस', B: 'प्रिंटर', C: 'मॉनिटर', D: 'स्पीकर' },
      correct_option: 'A',
      explanation: 'माउस एक इनपुट डिवाइस है, जिससे हम कर्सर घुमाते, क्लिक करते और चुनाव करते हैं। प्रिंटर, मॉनिटर और स्पीकर आउटपुट डिवाइस हैं।',
      simple_explanation: 'माउस से निर्देश देते हैं, इसलिए यह इनपुट डिवाइस है।',
      clue: 'इस डिवाइस को हाथ से सरकाकर कर्सर चलाते हैं।',
      illustration: 'mouse', source_reference: null,
    },
    {
      question_id: 'hi_r2', stage: 3, reserve: true, difficulty: 'medium', cognitive_level: 'application', concept_tag: 'फाइल प्रबंधन',
      question: 'कंप्यूटर में फाइलों को व्यवस्थित रखने के लिए किसका उपयोग किया जाता है?',
      options: { A: 'फोल्डर', B: 'रीसायकल बिन', C: 'डेस्कटॉप', D: 'टास्कबार' },
      correct_option: 'A',
      explanation: 'एक जैसी फाइलें एक फोल्डर में रखने से उन्हें ढूँढना आसान हो जाता है। फोल्डर के अंदर सब-फोल्डर भी बनाए जा सकते हैं।',
      simple_explanation: 'फाइलों का बक्सा = फोल्डर।',
      clue: 'यह अलमारी के खाने जैसा होता है जिसमें चीज़ें सजाकर रखते हैं।',
      illustration: 'folder', source_reference: null,
    },
    {
      question_id: 'hi_r3', stage: 4, reserve: true, difficulty: 'hard', cognitive_level: 'reasoning', concept_tag: 'कंप्यूटर वायरस',
      question: 'कंप्यूटर वायरस क्या होता है?',
      options: { A: 'हार्डवेयर का एक भाग', B: 'एक हानिकारक प्रोग्राम जो फाइलों को नुकसान पहुँचा सकता है', C: 'इंटरनेट की गति बढ़ाने वाला टूल', D: 'प्रिंटर की एक प्रकार की स्याही' },
      correct_option: 'B',
      explanation: 'कंप्यूटर वायरस एक हानिकारक प्रोग्राम है जो अपनी नकल बनाता है और फाइलों या सिस्टम को नुकसान पहुँचा सकता है। इससे बचाव के लिए एंटीवायरस सॉफ्टवेयर उपयोग किया जाता है।',
      simple_explanation: 'वायरस एक खराब प्रोग्राम है जो कंप्यूटर को नुकसान देता है।',
      clue: 'यह जीवित नहीं, सॉफ्टवेयर के रूप में फैलने वाली चीज़ है।',
      illustration: 'virus', source_reference: null,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* PACK 2 — English, Science, Solar System (Class 5)                   */
/* ------------------------------------------------------------------ */

const q = (id, stage, difficulty, cognitive, tag, question, options, correct, explanation, clue, illustration, simple) => ({
  question_id: id, stage, difficulty, cognitive_level: cognitive, concept_tag: tag,
  question, options, correct_option: correct, explanation,
  simple_explanation: simple || explanation, clue, illustration, source_reference: null,
});

const packSolarSystem = {
  id: 'pack_en_solar_c5',
  class_level: 5,
  subject: 'Science',
  language: 'en',
  topic: 'Solar System',
  title: 'Class 5 – Solar System Challenge',
  aliases: ['solar system', 'solar', 'planets', 'planet', 'space', 'sun', 'saur mandal', 'सौरमंडल', 'ग्रह'],
  description: 'Planets, the Sun, the Moon and the movements of our solar system',
  questions: [
    /* stage 1 */
    q('sol_01', 1, 'very_easy', 'recall', 'planet identity',
      'Which planet is known as the Red Planet?',
      { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, 'B',
      'Mars looks red because iron minerals in its soil rust and give the surface a reddish colour.',
      'This planet is famous for its reddish appearance.', 'planet_mars',
      'Mars has red dust on it, so we call it the Red Planet.'),
    q('sol_02', 1, 'very_easy', 'recognition', 'our planet',
      'On which planet do we live?',
      { A: 'Earth', B: 'Mars', C: 'Venus', D: 'Jupiter' }, 'A',
      'We live on Earth. It is the only planet known to have life because it has air, water and the right temperature.',
      'This planet has oceans, forests and people.', 'planet_earth',
      'We live on Earth.'),
    q('sol_03', 1, 'very_easy', 'recall', 'the sun',
      'What is at the centre of our solar system?',
      { A: 'The Moon', B: 'The Sun', C: 'Earth', D: 'Jupiter' }, 'B',
      'The Sun is at the centre of our solar system. All the planets move around it because of its strong gravity.',
      'Everything in our solar system moves around this giant star.', 'sun',
      'The Sun is in the middle, and all planets move around it.'),

    /* stage 2 */
    q('sol_04', 2, 'easy', 'recall', 'planet size',
      'Which is the largest planet in our solar system?',
      { A: 'Jupiter', B: 'Saturn', C: 'Earth', D: 'Neptune' }, 'A',
      'Jupiter is the largest planet. More than 1,300 Earths could fit inside it.',
      'Its name is taken from the king of Roman gods.', 'planet_jupiter',
      'Jupiter is the biggest planet of all.'),
    q('sol_05', 2, 'easy', 'understanding', 'planet count',
      'How many planets are there in our solar system?',
      { A: 'Seven', B: 'Eight', C: 'Nine', D: 'Ten' }, 'B',
      'There are eight planets. Pluto was counted as the ninth planet until 2006, when scientists reclassified it as a dwarf planet.',
      'The count is one less than nine.', 'planets_row',
      'There are eight planets. Pluto is now called a dwarf planet.'),
    q('sol_06', 2, 'easy', 'recall', 'planet order',
      'Which planet is closest to the Sun?',
      { A: 'Mercury', B: 'Venus', C: 'Earth', D: 'Mars' }, 'A',
      'Mercury is the closest planet to the Sun. It is also the smallest planet and completes one round of the Sun in only 88 days.',
      'It is the smallest planet and the first one from the Sun.', 'sun',
      'Mercury is nearest to the Sun.'),

    /* stage 3 */
    q('sol_07', 3, 'medium', 'understanding', 'orbits',
      'What is the shape of a planet\'s path around the Sun?',
      { A: 'A perfect circle', B: 'An ellipse', C: 'A square', D: 'A straight line' }, 'B',
      'Each planet moves around the Sun in a slightly stretched circle called an ellipse. That is why the distance from the Sun changes during the year.',
      'It is a stretched, oval shape, not a perfect round.', 'orbit',
      'The path is a stretched circle, called an ellipse.'),
    q('sol_08', 3, 'medium', 'understanding', 'day and night',
      'What causes day and night on Earth?',
      { A: 'Earth moving around the Sun', B: 'Earth spinning on its own axis', C: 'The Moon moving around Earth', D: 'The Sun moving around Earth' }, 'B',
      'Earth spins on its own axis once in about 24 hours. The side facing the Sun has day and the other side has night.',
      'Think about Earth turning round like a spinning top.', 'planet_earth',
      'Earth spins round once a day, so we get day and night.'),
    q('sol_09', 3, 'medium', 'recall', 'morning star',
      'Which planet is called the Morning Star and the Evening Star?',
      { A: 'Venus', B: 'Mercury', C: 'Mars', D: 'Neptune' }, 'A',
      'Venus is called the Morning Star and the Evening Star because it shines very brightly just before sunrise or just after sunset.',
      'It is the brightest planet we can see from Earth.', 'planet_venus',
      'Venus shines brightly near sunrise and sunset.'),

    /* stage 4 */
    q('sol_10', 4, 'hard', 'recall', 'rings',
      'Which planet has the most prominent rings?',
      { A: 'Jupiter', B: 'Saturn', C: 'Uranus', D: 'Neptune' }, 'B',
      'Saturn has the brightest and widest rings, made of ice and rock pieces. All four giant planets have rings, but Saturn\'s are the most visible.',
      'Its rings can be seen even with a small telescope.', 'planet_saturn',
      'Saturn has the biggest, brightest rings.'),
    q('sol_11', 4, 'hard', 'understanding', 'natural satellite',
      'Which of these is a natural satellite of Earth?',
      { A: 'The Moon', B: 'Phobos', C: 'Titan', D: 'Europa' }, 'A',
      'The Moon is Earth\'s only natural satellite. Phobos goes around Mars, and Titan and Europa are moons of Saturn and Jupiter.',
      'It lights up our night sky and changes shape every week.', 'moon',
      'The Moon is Earth\'s natural satellite.'),
    q('sol_12', 4, 'hard', 'reasoning', 'moon gravity',
      'Why does the Moon have almost no atmosphere?',
      { A: 'It is too far from the Sun', B: 'Its gravity is too weak', C: 'It has no water', D: 'It is full of craters' }, 'B',
      'Because the Moon is much smaller than Earth, its gravity is weak. Weak gravity cannot hold gas molecules, so they escape into space.',
      'Think about the size of the Moon compared with Earth.', 'moon',
      'The Moon is small, so its gravity cannot hold gases.'),

    /* stage 5 */
    q('sol_13', 5, 'highest', 'reasoning', 'light year',
      'A light year is a unit of what?',
      { A: 'Time', B: 'Distance', C: 'Brightness', D: 'Mass' }, 'B',
      'A light year is the distance that light travels in one year, about 9.46 trillion kilometres. It measures distance, not time.',
      'The word has "year" in it, but it measures something else.', 'rocket',
      'A light year measures distance, not time.'),
    q('sol_14', 5, 'highest', 'understanding', 'axial tilt',
      'Which planet rotates on its side, almost lying down?',
      { A: 'Neptune', B: 'Uranus', C: 'Saturn', D: 'Mars' }, 'B',
      'Uranus is tilted about 98 degrees, so it spins almost on its side. Its tilt may have been caused by a huge collision long ago.',
      'This planet\'s axis tilt is about 98 degrees.', 'planet_uranus',
      'Uranus is tipped over and spins on its side.'),
    q('sol_15', 5, 'highest', 'understanding', 'sun layers',
      'In which part of the Sun is energy produced by nuclear fusion?',
      { A: 'Corona', B: 'Photosphere', C: 'Core', D: 'Chromosphere' }, 'C',
      'The core of the Sun is its centre, where extremely high temperature and pressure join hydrogen atoms to form helium and release huge energy.',
      'It is the innermost, hottest part of the Sun.', 'sun',
      'The Sun makes energy deep inside its core.'),

    /* reserves */
    q('sol_r1', 3, 'medium', 'recall', 'planet order',
      'Which planet is farthest from the Sun?',
      { A: 'Saturn', B: 'Uranus', C: 'Neptune', D: 'Pluto' }, 'C',
      'Neptune is the farthest planet from the Sun. Pluto lies even farther out, but it is classified as a dwarf planet, not a planet.',
      'It is the eighth and last planet of our solar system.', 'planet_neptune',
      'Neptune is the last planet from the Sun.'),
    q('sol_r2', 2, 'easy', 'recall', 'the sun',
      'What is the Sun mainly made of?',
      { A: 'Rocks and metals', B: 'Hydrogen and helium', C: 'Water and ice', D: 'Oxygen and nitrogen' }, 'B',
      'The Sun is a huge ball of hot gases, mostly hydrogen and helium. It makes its own light, so it is a star.',
      'These two are the lightest gases in the universe.', 'sun',
      'The Sun is made mostly of hydrogen and helium gas.'),
    q('sol_r3', 4, 'hard', 'understanding', 'planet comparison',
      'Which planet is often called Earth\'s twin because of its similar size?',
      { A: 'Mars', B: 'Venus', C: 'Mercury', D: 'Neptune' }, 'B',
      'Venus is almost the same size as Earth, so it is called Earth\'s twin. However, its thick atmosphere makes it the hottest planet.',
      'It is our nearest planetary neighbour and almost the same size.', 'planet_venus',
      'Venus is almost as big as Earth, so it is called our twin.'),
  ],
};

/* ------------------------------------------------------------------ */
/* PACK 3 — English, EVS, Animals (Class 1) — Tier A visuals           */
/* ------------------------------------------------------------------ */

const packAnimals = {
  id: 'pack_en_animals_c1',
  class_level: 1,
  subject: 'EVS',
  language: 'en',
  topic: 'Animals',
  title: 'Class 1 – Animal Friends Challenge',
  aliases: ['animals', 'animal', 'janwar', 'जानवर', 'birds', 'pets', 'wild animals'],
  description: 'Animal sounds, homes, food and special features for the youngest learners',
  questions: [
    q('ani_01', 1, 'very_easy', 'recognition', 'animal sounds',
      'Which animal says "moo"?',
      { A: 'Cow', B: 'Dog', C: 'Cat', D: 'Duck' }, 'A',
      'A cow says "moo". Cows give us milk.',
      'This animal gives us milk every day.', 'animal_cow',
      'The cow says moo.'),
    q('ani_02', 1, 'very_easy', 'recognition', 'animal features',
      'Which animal has a long trunk?',
      { A: 'Horse', B: 'Elephant', C: 'Goat', D: 'Lion' }, 'B',
      'An elephant has a long trunk. It drinks water and picks up food with it.',
      'This is the biggest land animal with big ears.', 'animal_elephant',
      'The elephant has a long trunk.'),

    q('ani_03', 2, 'easy', 'recognition', 'animal homes',
      'Which animal lives in water?',
      { A: 'Bird', B: 'Fish', C: 'Camel', D: 'Monkey' }, 'B',
      'A fish lives in water. It swims with fins and breathes with gills.',
      'This animal swims and cannot live outside water.', 'animal_fish',
      'A fish lives in water.'),
    q('ani_04', 2, 'easy', 'recall', 'counting legs',
      'How many legs does a dog have?',
      { A: 'Two', B: 'Three', C: 'Four', D: 'Six' }, 'C',
      'A dog has four legs. It walks and runs on all four legs.',
      'Count the legs of a dog, cat or cow.', 'animal_dog',
      'A dog has four legs.'),

    q('ani_05', 3, 'medium', 'understanding', 'animal food',
      'Which animal eats only plants?',
      { A: 'Lion', B: 'Cow', C: 'Tiger', D: 'Wolf' }, 'B',
      'A cow eats grass and plants only. Animals that eat plants are called herbivores.',
      'This animal eats grass in the field.', 'animal_cow',
      'The cow eats grass and plants.'),
    q('ani_06', 3, 'medium', 'recognition', 'animal body',
      'Which animal has a hard shell on its back?',
      { A: 'Rabbit', B: 'Turtle', C: 'Squirrel', D: 'Deer' }, 'B',
      'A turtle has a hard shell on its back. It hides inside the shell when it feels scared.',
      'This animal walks very slowly and hides in its shell.', 'animal_turtle',
      'The turtle has a hard shell on its back.'),

    q('ani_07', 4, 'hard', 'understanding', 'baby animals',
      'A baby dog is called what?',
      { A: 'Kitten', B: 'Puppy', C: 'Calf', D: 'Chick' }, 'B',
      'A baby dog is called a puppy. A baby cat is a kitten, a baby cow is a calf and a baby hen is a chick.',
      'The word starts with the same letter as "pup".', 'animal_puppy',
      'A baby dog is a puppy.'),
    q('ani_08', 4, 'hard', 'reasoning', 'hibernation',
      'Which animal sleeps through the cold winter?',
      { A: 'Bear', B: 'Horse', C: 'Parrot', D: 'Fish' }, 'A',
      'A bear sleeps through the cold winter. This long winter sleep is called hibernation.',
      'It is a big furry animal that loves honey.', 'animal_bear',
      'The bear sleeps all winter long.'),

    q('ani_09', 5, 'highest', 'reasoning', 'camouflage',
      'Which animal changes colour to hide?',
      { A: 'Chameleon', B: 'Peacock', C: 'Rabbit', D: 'Elephant' }, 'A',
      'A chameleon changes its colour to mix with leaves and branches. This hiding trick is called camouflage.',
      'It is a small lizard that sits on trees.', 'animal_chameleon',
      'The chameleon changes colour to hide.'),
    q('ani_10', 5, 'highest', 'reasoning', 'flightless birds',
      'Which bird cannot fly but runs very fast?',
      { A: 'Ostrich', B: 'Sparrow', C: 'Crow', D: 'Pigeon' }, 'A',
      'An ostrich cannot fly, but it runs very fast on its long strong legs. It is the biggest bird in the world.',
      'It is the tallest and heaviest bird.', 'animal_ostrich',
      'The ostrich runs fast but cannot fly.'),

    /* reserves */
    q('ani_r1', 2, 'easy', 'recognition', 'animal features',
      'Which animal has a very long neck?',
      { A: 'Giraffe', B: 'Zebra', C: 'Cat', D: 'Frog' }, 'A',
      'A giraffe has a very long neck. It eats leaves from the tops of tall trees.',
      'It is the tallest animal in the world.', 'animal_giraffe',
      'The giraffe has a very long neck.'),
    q('ani_r2', 3, 'medium', 'recognition', 'wild animals',
      'Which animal is called the king of the jungle?',
      { A: 'Lion', B: 'Deer', C: 'Goat', D: 'Hen' }, 'A',
      'The lion is called the king of the jungle. It is a strong wild animal with a loud roar.',
      'It has a big mane and roars loudly.', 'animal_lion',
      'The lion is called the king of the jungle.'),
  ],
};

export const PACKS = [packAnimals, packSolarSystem, packHindiComputer];

export const PACK_INDEX = PACKS.map((p) => ({
  id: p.id,
  class_level: p.class_level,
  subject: p.subject,
  language: p.language,
  topic: p.topic,
  title: p.title,
  description: p.description,
  questions: p.questions.filter((x) => !x.reserve).length,
  reserves: p.questions.filter((x) => x.reserve).length,
}));

export function findPack(topic, classLevel) {
  const needle = String(topic || '').toLowerCase().trim();
  if (!needle) return null;
  const score = (pack) => {
    let best = 0;
    for (const alias of pack.aliases) {
      const a = alias.toLowerCase();
      if (!a) continue;
      if (needle === a) best = Math.max(best, 3);
      else if (needle.includes(a) || a.includes(needle)) best = Math.max(best, 2);
    }
    if (String(pack.topic).toLowerCase().includes(needle)) best = Math.max(best, 2);
    if (Number(pack.class_level) === Number(classLevel)) best += 0.5;
    return best;
  };
  const ranked = PACKS.map((p) => ({ pack: p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return ranked.length ? ranked[0].pack : null;
}

export default PACKS;
