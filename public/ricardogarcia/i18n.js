/* Landing do Ricardo em PT e EN.
   O HTML está escrito em PT; em EN cada texto é trocado por esta tabela antes das animações partirem as palavras.
   Língua: ?lang=en|pt, depois a escolha guardada, depois a língua do browser (fora de PT/BR vai para EN). */
(function () {
  var EN = {
    'Links': 'Links', 'História': 'Story', 'Trajeto': 'Journey', 'Caminhos': 'Paths', 'Parceiros': 'Partners', 'Contacto': 'Contact',
    'Marcar conversa': 'Book a call', 'Entrar': 'Log in', 'Área do Ricardo': "Ricardo's area",
    'Destruí a minha vida': 'I destroyed my life', 'para a reconstruir': 'to rebuild it',
    'Sou o Ricardo Garcia. Vim de uma família adotiva, de origem humilde, no Porto. Catorze anos de farda, Exército, Fuzileiros e GNR. Larguei o emprego de sonho e recomecei do zero. Hoje sou uma pessoa completamente diferente, e é isso que a MoreThanMoney existe para te dar: conhecimento, ferramentas e uma equipa ao teu lado.':
      "I'm Ricardo Garcia. I grew up in an adoptive family of humble origins in Porto. Fourteen years in uniform: Army, Marines and the GNR. I quit my dream job and started again from zero. Today I'm a completely different person, and that is what MoreThanMoney exists to give you: knowledge, tools and a team by your side.",
    '@ricardogarciapt · fundador da MoreThanMoney': '@ricardogarciapt · founder of MoreThanMoney',
    'e tu, o que estás disposto a mudar?': 'and you, what are you willing to change?',
    'Ver a minha história': 'See my story', 'Escolher o meu caminho': 'Choose my path', 'desliza': 'scroll',
    'A minha': 'My', 'história': 'story', ', contada por mim': ', told by me',
    'De onde vim, o que tive de destruir e porque é que a MoreThanMoney existe.': 'Where I came from, what I had to destroy and why MoreThanMoney exists.',
    'Ver o vídeo': 'Watch the video', 'Ligar o som': 'Turn sound on',
    'Vídeo criado com IA a partir da imagem e da voz do Ricardo. A história é dele, palavra por palavra.': "Video created with AI from Ricardo's image and voice. The story is his, word for word.",
    'O': 'The', 'trajeto': 'journey', 'Seis capítulos, do Porto à MoreThanMoney.': 'Six chapters, from Porto to MoreThanMoney.',
    'Porto · 16 anos': 'Porto · age 16', 'Desde o início': 'From the start', 'já era diferente': 'I was already different',
    'Família adotiva, origem humilde, na cidade do Porto.': 'Adoptive family, humble origins, in the city of Porto.',
    'Aos dezasseis anos percebi que tinha de ser diferente. Porque, desde o início, já o era.': 'At sixteen I realised I had to be different. Because, from the start, I already was.',
    'Disciplina': 'Military', 'militar': 'discipline',
    'Exército em 2003. Fuzileiros em 2008. GNR em 2010. Catorze anos de serviço.': 'Army in 2003. Marines in 2008. GNR in 2010. Fourteen years of service.',
    'a disciplina ficou. o resto tive de largar.': 'the discipline stayed. the rest I had to let go.',
    'A família': 'Family', 'A Liliana': 'Liliana', 'e a Constança': 'and Constança',
    'A Liliana, a minha mulher, estava a lutar contra um cancro da mama. A Constança tinha três anos.': 'Liliana, my wife, was fighting breast cancer. Constança was three years old.',
    'Vendemos a casa de que gostávamos para ficarmos mais perto dos tratamentos.': 'We sold the house we loved to be closer to the treatments.',
    'O limite': 'The limit', 'Tive de': 'I had to', 'destruir tudo': 'destroy everything',
    'O ordenado do Estado não chegava. Três horas de transportes por dia. Sem liberdade, sem cabeça, e o stress pós-traumático do passado a matar-me.': "The state salary wasn't enough. Three hours of commuting a day. No freedom, no headspace, and post-traumatic stress from the past killing me.",
    'Larguei o emprego de sonho, porque não me dava o que eu precisava.': "I quit my dream job, because it didn't give me what I needed.",
    'O recomeço': 'The restart', 'Nasce a': 'Enter', 'MoreThanMoney': 'MoreThanMoney',
    'Aprendi os mercados, a tecnologia e a inteligência artificial, e construí tudo com as minhas mãos e com a minha equipa.': 'I learned the markets, technology and artificial intelligence, and built everything with my own hands and my team.',
    'A MoreThanMoney é tudo o que temos construído.': 'MoreThanMoney is everything we have built.',
    'A missão': 'The mission', 'Para não pagares': "So you don't pay", 'o preço que eu paguei': 'the price I paid',
    'Conhecimento, ferramentas e acompanhamento, com transparência. Não há resultados garantidos: há trabalho, disciplina e uma equipa ao teu lado.': 'Knowledge, tools and guidance, with transparency. There are no guaranteed results: there is work, discipline and a team by your side.',
    'o próximo capítulo pode ser o teu.': 'the next chapter could be yours.',
    'Família': 'Family', 'Recomeço': 'Restart', 'Missão': 'Mission', 'Liliana & Constança': 'Liliana & Constança',
    'Não há resultados garantidos. Há': 'There are no guaranteed results. There is', 'trabalho': 'work', 'disciplina': 'discipline', 'e uma': 'and a',
    'equipa ao teu lado': 'team by your side', '. É isso que eu não tive, e é isso que te quero dar.': ". That's what I didn't have, and that's what I want to give you.",
    'Onde tudo': 'Where it all', 'se liga': 'connects',
    'A marca pessoal é a porta. A MoreThanMoney é a casa. Tudo o que crio vai parar a um destes caminhos, para aprenderes, automatizares ou levares a IA para o teu negócio.': 'My personal brand is the door. MoreThanMoney is the house. Everything I create leads to one of these paths, so you can learn, automate or bring AI into your business.',
    'Um ecossistema, uma regra: educação primeiro, transparência sempre, nenhuma promessa de lucro.': 'One ecosystem, one rule: education first, transparency always, no promise of profit.',
    'Formação': 'Education', 'Soluções com IA': 'AI solutions',
    'Escolhe o teu': 'Choose your', 'caminho': 'path', 'Se a minha história te tocou, há três formas de caminharmos juntos.': 'If my story moved you, there are three ways we can walk together.',
    'Aprender': 'Learn', 'Aprende na': 'Learn at',
    'Educação financeira, mercados e ferramentas de trading, com método e uma comunidade. Começa pela app ou experimenta o Premium.': 'Financial education, markets and trading tools, with a method and a community. Start with the app or try Premium.',
    'Membro MTM': 'MTM Member', 'Premium · 3 dias grátis, sem cartão': 'Premium · 3 days free, no card',
    'MTM Funded · contas simuladas': 'MTM Funded · simulated accounts', 'Abrir conta na corretora recomendada': 'Open an account with the recommended broker',
    'Começar a aprender': 'Start learning', 'Negócio': 'Business', 'Leva o teu negócio': 'Take your business', 'mais longe': 'further',
    'Sites, apps, funis, agendas e agentes de IA à medida, com o nosso acompanhamento do diagnóstico à entrega. Vê exemplos reais por sector.': 'Custom websites, apps, funnels, booking systems and AI agents, with our support from diagnosis to delivery. See real examples by sector.',
    'Ver as soluções': 'See the solutions', 'Marcar diagnóstico': 'Book a diagnosis', 'Ver soluções para negócios': 'See business solutions',
    'Trabalhar connosco': 'Work with us', 'Junta-te': 'Join', 'à equipa': 'the team',
    'Trabalha com a nossa corretora recomendada e/ou com a MoreThanMoney. Escolhe o papel que te assenta e falamos.': 'Work with our recommended broker and/or with MoreThanMoney. Pick the role that suits you and we will talk.',
    'Educador': 'Educator', 'Comercial': 'Sales', 'Parceiro de negócios': 'Business partner', 'Corretora recomendada': 'Recommended broker',
    'Por onde': 'Where do', 'queres ir?': 'you want to go?',
    'Assiste às minhas aulas': 'Watch my classes', 'Acesso às sessões onde educo, de graça': 'Free access to the sessions where I teach',
    'Agenda uma conversa comigo': 'Book a call with me', 'Sessão 1 para 1 para te esclarecer': 'A 1-to-1 session to answer your questions',
    'Marketplace e ofertas': 'Marketplace and offers', 'Produtos digitais e ferramentas': 'Digital products and tools',
    'Fala comigo no WhatsApp': 'Message me on WhatsApp', 'Manda mensagem e esclareço-te': "Send a message and I'll answer",
    'Grátis · web app': 'Free · web app', 'A minha app:': 'My app:',
    'Três missões por dia, pensadas por mim: treino sem pesos, mindset e digital com IA. Sobe de patente, ganha insígnias e troca moedas por recompensas reais.': 'Three missions a day, designed by me: bodyweight training, mindset and digital skills with AI. Rank up, earn badges and trade coins for real rewards.',
    '🔥 Treinos de 7 a 10 minutos, em casa': '🔥 7 to 10 minute workouts, at home', '🧠 Cápsulas de mindset com reflexão': '🧠 Mindset capsules with reflection',
    '⚡ Micro-lições de IA e marca pessoal': '⚡ Micro-lessons on AI and personal branding', '🎖️ Patentes, insígnias e esquadrão': '🎖️ Ranks, badges and squad',
    'Começar a missão': 'Start the mission', 'Já tenho conta': 'I have an account', 'Saber mais': 'Learn more',
    'SOLDADO': 'PRIVATE', '180 XP para Cabo': '180 XP to Corporal', '🔥 Circuito de arranque': '🔥 Starter circuit',
    '🧠 O que controlas hoje': '🧠 What you control today', '⚡ O teu primeiro prompt': '⚡ Your first prompt', 'Exemplo ilustrativo': 'Illustrative example',
    'Produtos': 'Digital', 'digitais': 'products', 'Feitos por mim, para começares com estrutura.': 'Made by me, so you start with structure.',
    'da marca': 'of the brand', 'Como marca pessoal, trabalho com duas fintech que nos ajudam a chegar a mais pessoas e a ter melhores soluções de pagamento, e com a PU Prime, a corretora que recomendo.': 'As a personal brand, I work with two fintechs that help us reach more people and offer better payment solutions, and with PU Prime, the broker I recommend.',
    'Fintech · alcance e pagamentos': 'Fintech · reach and payments', 'A casa de tudo o que construímos': 'The home of everything we build',
    'Falamos': 'Talk for', '10 minutos?': '10 minutes?',
    'Conta-me onde estás e para onde queres ir. Dizemos-te com sinceridade se a MoreThanMoney é para ti, e por onde começar.': "Tell me where you are and where you want to go. We'll tell you honestly whether MoreThanMoney is for you, and where to start.",
    'Marcar uma conversa': 'Book a call', 'Falar no WhatsApp': 'Chat on WhatsApp', 'Fala': 'Talk', 'comigo': 'to me',
    'Deixa a tua mensagem e respondo eu.': "Leave your message and I'll reply myself.", 'Nome': 'Name', 'O que te traz aqui?': 'What brings you here?',
    'Quero falar contigo': 'I want to talk to you', 'Quero aprender': 'I want to learn', 'Tenho um negócio': 'I have a business',
    'Quero trabalhar convosco': 'I want to work with you', 'Proposta de parceria': 'Partnership proposal', 'Telemóvel': 'Phone',
    'Mensagem (opcional)': 'Message (optional)', 'Empresa': 'Company',
    'Aceito que o Ricardo e a MoreThanMoney usem estes dados para me responder. Consulta a': 'I agree that Ricardo and MoreThanMoney may use this data to reply to me. See the',
    'política de privacidade': 'privacy policy', 'Enviar mensagem': 'Send message', 'Onde me': 'Where to', 'encontras': 'find me',
    'Assistente MTM': 'MTM Assistant', 'Falar': 'Talk',
    'Conteúdo educativo, não constitui aconselhamento financeiro. O trading envolve risco de perda de capital e resultados passados não garantem resultados futuros. As contas MTM Funded são simuladas; a MoreThanMoney não é uma prop firm nem custodia fundos de clientes.':
      'Educational content, not financial advice. Trading involves risk of capital loss and past results do not guarantee future results. MTM Funded accounts are simulated; MoreThanMoney is not a prop firm and does not hold client funds.',
    'Corretora parceira': 'Partner broker',
    'A corretora com que trabalho. Abres conta pelo link da MoreThanMoney, validas no nosso Telegram e eu acompanho o teu arranque.': 'The broker I work with. Open your account through the MoreThanMoney link, validate it on our Telegram and I will guide your start.',
    'Abre a conta': 'Open the account', 'Pelo link da MoreThanMoney, para ficares ligado à nossa equipa.': 'Through the MoreThanMoney link, so you are connected to our team.',
    'Valida no Telegram': 'Validate on Telegram', 'O assistente MTM pede-te o UID da conta e confirma que está ligada a nós.': 'The MTM assistant asks for your account UID and confirms it is linked to us.',
    'Onboarding comigo': 'Onboarding with me', 'Eu confirmo a tua conta e fazemos juntos os primeiros passos.': 'I confirm your account and we take the first steps together.',
    '1 · Abrir conta': '1 · Open account', '2 · Validar no Telegram': '2 · Validate on Telegram', 'Falar comigo': 'Talk to me',
    'O trading envolve risco de perda de capital. A conta é tua e fica na corretora; a MoreThanMoney nunca guarda o teu dinheiro.': 'Trading involves risk of capital loss. The account is yours and stays with the broker; MoreThanMoney never holds your money.',
    // atributos
    'Ricardo Garcia, início': 'Ricardo Garcia, home', 'Logótipo RG de Ricardo Garcia': 'Ricardo Garcia RG logo', 'Secções': 'Sections',
    'Entrar na app do Ricardo': "Log in to Ricardo's app", 'Ricardo Garcia em Lisboa, ao fim da tarde, com o portátil': 'Ricardo Garcia in Lisbon, late afternoon, with his laptop',
    'Descer para a história': 'Scroll to the story', 'Ver o vídeo de apresentação do Ricardo': "Watch Ricardo's introduction video", 'Ligar o som do vídeo': 'Turn on video sound',
    'Capítulo anterior': 'Previous chapter', 'Capítulo seguinte': 'Next chapter', 'Capítulos do trajeto do Ricardo': "Chapters of Ricardo's journey",
    'O Ricardo em criança, numa fotografia antiga do Porto, ao lado do Ricardo jovem, de fato de trabalho e chave de tubos na mão': 'Ricardo as a child in an old photo from Porto, next to young Ricardo in work overalls holding a pipe wrench',
    'O Ricardo com a farda da GNR, com o chapéu e a medalha de serviço ao fundo': 'Ricardo in GNR uniform, with his hat and service medal in the background',
    'O Ricardo com a Liliana e a Constança, a sorrir': 'Ricardo with Liliana and Constança, smiling',
    'O Ricardo agarrado a uma grade de ferro, a olhar para fora': 'Ricardo holding an iron railing, looking out',
    'O Ricardo a sorrir, de telemóvel na mão e portátil aberto': 'Ricardo smiling, phone in hand and laptop open', 'O Ricardo em palco, de microfone na mão': 'Ricardo on stage, microphone in hand',
    'Diagrama: Ricardo Garcia ligado à MoreThanMoney, que se liga a Formação, MTM Auto, MTM Funded e Soluções com IA': 'Diagram: Ricardo Garcia connected to MoreThanMoney, which connects to Education, MTM Auto, MTM Funded and AI solutions',
    'Atalhos': 'Shortcuts', 'Escolhe um tema': 'Pick a topic', 'A app do Ricardo': "Ricardo's app",
    // meta
    'Ricardo Garcia (@ricardogarciapt): do Porto à farda, da farda à MoreThanMoney. A história, a missão e os caminhos para aprenderes, levares o teu negócio mais longe ou trabalhares connosco.': 'Ricardo Garcia (@ricardogarciapt): from Porto to the uniform, from the uniform to MoreThanMoney. The story, the mission and the paths to learn, take your business further or work with us.',
    'Destruí a minha vida para hoje ser uma pessoa completamente diferente. Fundador da MoreThanMoney.': 'I destroyed my life to become a completely different person today. Founder of MoreThanMoney.',
    // textos do script
    'Quero este': 'I want this', 'Diz-me o teu nome.': 'Tell me your name.', 'Deixa um email ou telemóvel para te responder.': 'Leave an email or phone number so I can reply.',
    'Confirma o consentimento para te podermos responder.': 'Please confirm consent so we can reply.', 'A enviar…': 'Sending…',
    'Recebido! Respondo-te em breve. 🙌': "Received. I'll reply soon. 🙌", 'Não consegui enviar. Tenta outra vez.': "Couldn't send. Please try again.",
    'Sem ligação. Tenta outra vez.': 'No connection. Please try again.', '/mês': '/month'
  };

  var lang = 'pt';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'pt') { lang = q; try { localStorage.setItem('rg_lang', q); } catch (e) {} }
    else {
      var g = null; try { g = localStorage.getItem('rg_lang'); } catch (e) {}
      if (g === 'en' || g === 'pt') lang = g;
      else { var n = (navigator.languages && navigator.languages[0]) || navigator.language || 'pt'; lang = /^pt/i.test(n) ? 'pt' : 'en'; }
    }
  } catch (e) {}

  window.RG_LANG = lang;
  window.T = function (s) { return lang === 'en' && EN.hasOwnProperty(s) ? EN[s] : s; };

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function traduzir(raiz) {
    if (lang !== 'en') return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), n, lista = [];
    while ((n = w.nextNode())) lista.push(n);
    lista.forEach(function (n) {
      var p = n.parentElement; if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName)) return;
      var k = norm(n.nodeValue); if (!k || !EN.hasOwnProperty(k)) return;
      var a = n.nodeValue.match(/^\s*/)[0], b = n.nodeValue.match(/\s*$/)[0];
      n.nodeValue = a + EN[k] + b;
    });
    Array.prototype.forEach.call(raiz.querySelectorAll('[alt],[aria-label],[placeholder],[title]'), function (e) {
      ['alt', 'aria-label', 'placeholder', 'title'].forEach(function (at) { var v = e.getAttribute(at); if (v && EN.hasOwnProperty(norm(v))) e.setAttribute(at, EN[norm(v)]); });
    });
  }
  window.RG_traduzir = traduzir;

  function iniciar() {
    if (lang === 'en') {
      document.documentElement.lang = 'en';
      Array.prototype.forEach.call(document.querySelectorAll('[data-en]'), function (e) { e.innerHTML = e.getAttribute('data-en'); });
      traduzir(document.body);
      // Vídeo da história em inglês (tradução com a voz e os lábios do Ricardo).
      var v = document.getElementById('video-ricardo');
      if (v) {
        // Troca directa do src (o Safari do iPhone nem sempre recarrega quando só muda o <source>).
        // Se o vídeo inglês falhar, volta ao português com legendas em inglês ligadas.
        var EN_MP4 = '/ricardogarcia/apresentacao-ricardo-en.mp4', PT_MP4 = '/ricardogarcia/apresentacao-ricardo.mp4';
        var src = v.querySelector('source'); if (src) src.parentNode.removeChild(src);
        var tr = v.querySelector('track'); if (tr) { tr.setAttribute('src', '/ricardogarcia/apresentacao-ricardo-en.vtt'); tr.setAttribute('srclang', 'en'); tr.setAttribute('label', 'English'); }
        v.addEventListener('error', function recuo() {
          if (v.getAttribute('src') !== EN_MP4) return;
          v.removeEventListener('error', recuo); v.setAttribute('src', PT_MP4);
          try { v.load(); if (v.textTracks && v.textTracks[0]) v.textTracks[0].mode = 'showing'; } catch (e) {}
        });
        v.setAttribute('src', EN_MP4);
        try { v.load(); } catch (e) {}
      }
      ['meta[name=description]', 'meta[property="og:description"]'].forEach(function (s) { var m = document.querySelector(s); if (m && EN[norm(m.content)]) m.content = EN[norm(m.content)]; });
      // Mensagens pré-escritas do WhatsApp em inglês.
      Array.prototype.forEach.call(document.querySelectorAll('a[href*="wa.me/"][href*="text="]'), function (a) {
        a.href = a.href.replace(/text=[^&]*/, function (t) {
          var txt = decodeURIComponent(t.slice(5))
            .replace('Olá Ricardo, quero trabalhar com a MTM como ', 'Hi Ricardo, I want to work with MTM as a ')
            .replace('Olá Ricardo, quero ser parceiro de negócios da MTM', 'Hi Ricardo, I want to be an MTM business partner')
            .replace('Olá Ricardo, quero trabalhar com a corretora recomendada', 'Hi Ricardo, I want to work with the recommended broker')
            .replace('Olá Ricardo, vim da tua página', 'Hi Ricardo, I came from your page')
            .replace('Olá Ricardo, abri conta na PU Prime e quero fazer o onboarding', 'Hi Ricardo, I opened a PU Prime account and want to do the onboarding')
            .replace(/ educador$/, ' educator').replace(/ comercial$/, ' sales rep');
          return 'text=' + encodeURIComponent(txt);
        });
      });
    }
    // Botão PT | EN no topo.
    var alvo = document.querySelector('.acoes-topo');
    if (alvo && !document.getElementById('rgLang')) {
      var b = document.createElement('div'); b.id = 'rgLang'; b.className = 'lang-troca'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', lang === 'en' ? 'Language' : 'Língua');
      b.innerHTML = '<a href="?lang=pt" hreflang="pt-PT"' + (lang === 'pt' ? ' aria-current="true"' : '') + '>PT</a><a href="?lang=en" hreflang="en"' + (lang === 'en' ? ' aria-current="true"' : '') + '>EN</a>';
      alvo.insertBefore(b, alvo.firstChild);
    }
  }
  // Carregado no fim do <body>, antes do script das animações: o DOM já existe.
  iniciar();
})();
