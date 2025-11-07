// Never forget to set cookie to secure:true before deploying to production! While developing, set it to false

// Main imports
const express = require('express');
const app = express(); // Express instance, becomes the main application object
app.set('trust proxy', 1); // Trust reverse proxy (Nginx, etc.)
const exprhbs = require('express-handlebars'); // Handlebars module
const path = require('path'); // Native module that deals with paths
const { got } = require('got'); //HTTP client for APIs
require('dotenv').config(); // Environment variables, used to hide API keys and sensitive data

// Create MySQL connection pool to manage multiple connections and avoid timeout issues
const mysql = require('mysql2');
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,  // Maximum number of connections
  queueLimit: 0 // Maximum number of waiting connections. 0 means no limit
});

// Middleware that handles form data coming from front end http requests
app.use(express.urlencoded({ extended: true })); // this line of code tells our server to use the body-parser middleware to parse incoming request bodies. extended: true means that we are using the extended version of the body-parser middleware.
app.use(express.json()); // used to parse JSON data from the request body and make it available in the req.body property of the request object.

// Session Management, to keep users logged in, cookies, etc.
const session = require('express-session');
app.use(session({
  secret: process.env.EXPRESS_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,  //use false for local development and true for production!
    httpOnly: true,
    sameSite: 'lax'      // <--- Helps in persistence between pages
  }
}));

// Encryption of passwords
const bcrypt = require('bcryptjs');

// server port
const PORT = process.env.PORT;

// Middleware to protect private routes with login
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId != null) {
    return next();
  }
  res.redirect('/login');
}

// Configuration of the Handlebars as template engine
app.engine('handlebars', exprhbs.engine());
app.set('view engine', 'handlebars');

// Main route - Protected route of homepage dashboard, including mysql information
app.get('/', isAuthenticated, (req, res) => {
  const sqlCampanhasAtivas = "SELECT * FROM campanhas WHERE emAndamento = 1";
  const sqlGrafico = "SELECT TipoDeCampanha, leadsAlcancados, Inicio FROM campanhas";

  db.query(sqlCampanhasAtivas, function(err, campanhasAtivas) {
    if (err) throw err;

    db.query(sqlGrafico, function(err2, campanhasParaGrafico) {
      if (err2) throw err2;

      const dadosGrafico = campanhasParaGrafico.map(campanha => ({
        tipo: campanha.TipoDeCampanha,
        leads: campanha.leadsAlcancados,
        inicio: campanha.Inicio
      }));

      console.log('Acesso à página Home');

      res.render('home', {
        name: req.session.userName,
        campanhas: campanhasAtivas,
        dadosGrafico: JSON.stringify(dadosGrafico)
      });
    });
  });
});

// Routes - Other protected pages
app.get('/campanhaProspeccao', isAuthenticated, (req, res) => {
  console.log('Acesso à página campanhaProspeccao');
  res.render('campanhaProspeccao');
});

app.get('/faq', isAuthenticated, (req, res) => {
  console.log('Acesso à página faq');
  res.render('faq');
});

app.get('/prospection-error', isAuthenticated, (req, res) => {
  console.log('Acesso à página prospection-error');
  res.render('prospection-error');
});

app.get('/prospection-typeError', isAuthenticated, (req, res) => {
  console.log('Acesso à página prospection-typeError');
  res.render('prospection-typeError');
});

app.get('/prospection-limitError', isAuthenticated, (req, res) => {
  console.log('Acesso à página prospection-limitError');
  res.render('prospection-limitError');
});

app.get('/prospection-success', isAuthenticated, (req, res) => {
  console.log('Acesso à página prospection-success');
  res.render('prospection-success');
});

app.get('/history', isAuthenticated, (req, res) => {
  const sqlCampanhasFinalizadas = "SELECT * FROM campanhas WHERE emAndamento = 0";

  db.query(sqlCampanhasFinalizadas, (err, campanhasFinalizadas) => {
    if (err) throw err;

    console.log('Acesso à página history');
    
    res.render('history', {
      name: req.session.userName,
      campanhas: campanhasFinalizadas
    });
  });
});

// GET route to fetch unique cities for a given state
app.get('/api/cidades/:estado', isAuthenticated, (req, res) => {
  const estado = req.params.estado.toUpperCase();

  db.query('SELECT DISTINCT cidade FROM listadecidades WHERE estado = ?', [estado], (err, results) => {
    if (err) {
      console.error('Erro ao buscar cidades:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar cidades' });
    }

    const cidades = results.map(row => row.cidade);
    res.json(cidades);
  });
});

// GET route to display the login form
app.get('/login', (req, res) => {
  console.log('Acesso à página login');
  res.render('login');
});


// NEW POST route to authenticate the user
app.post('/login', (req, res) => {
  const { email, password, remember } = req.body; // Captura o checkbox "remember"
  console.log(req.body);

  db.query('SELECT * FROM ai_dashboard_users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('Erro no banco de dados:', err);
      return res.send('Erro no banco de dados');
    }

    if (results.length === 0) {
      return res.send('Usuário não encontrado');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.userId = user.id;
      req.session.userName = user.name;

      // Define tempo de vida do cookie se "remember" estiver marcado
      if (remember) {
        req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias
      } else {
        req.session.cookie.expires = false; // Expira ao fechar o navegador
      }

      req.session.save(() => {
        res.redirect('/');
      });

      console.log(`Usuário ${user.name} logado com sucesso!`);
    } else {
      res.send('Senha incorreta');
    }
  });
});


// Logout route to end the session
app.get('/logout', (req, res) => {
  console.log('Acesso à página logout');
  req.session.destroy(() => {
    res.redirect('/');
  });
});





// CAMPAIGNS CONTROL SECTION

// POST route to start campaign on N8N
app.post('/api/enviar-campanha', (req, res) => {
  const { tipoEmpresa, estado, cidade, baseText } = req.body;

  db.query('SELECT COUNT(*) AS total FROM campanhas WHERE emAndamento = 1', (err, results) => {
    if (err) {
      console.error('Erro ao consultar o banco de dados:', err.message);
      return res.redirect('/prospection-error');
    }

    const campanhasAtivas = results[0].total;
    const limiteCampanhas = parseInt(process.env.NUMBER_OF_CAMPAIGNS, 10);

    if (campanhasAtivas >= limiteCampanhas) {
      console.warn(`Limite de ${limiteCampanhas} campanhas simultâneas atingido.`);
      return res.redirect('/prospection-limitError');
    }

    // Define o webhook com base no valor de baseText
    let webhookUrl;
    if (baseText === 'AIprospection') {
      webhookUrl = process.env.N8N_WEBHOOK_1;
    } else if (baseText === 'websites') {
      webhookUrl = process.env.N8N_WEBHOOK_2;
    } else {
      console.error('Tipo de campanha inválido.');
      return res.redirect('/prospection-typeError');
    }

    // Envia os dados para o N8N
    got.post(webhookUrl, {
      json: { tipoEmpresa, estado, cidade },
      responseType: 'json'
    }).then(() => {
      console.log('Uma campanha de prospecção foi iniciada.');
      res.redirect('/prospection-success');
    }).catch(error => {
      console.error('Erro ao enviar para N8N:', error.message);
      res.redirect('/prospection-error');
    });
  });
});

// POST route to stop all active campaigns on N8N
app.post('/stopcampaign', (req, res) => {
  db.query('UPDATE campanhas SET emAndamento = 0 WHERE emAndamento = 1', (err, result) => {
    if (err) {
      console.error('Erro ao parar campanhas:', err);
      return res.status(500).send('Erro no banco de dados. Entre em contato com o suporte.');
    }

    if (result.affectedRows === 0) {
      return res.send('O comando de parada já foi enviado, pode ser necessário aguardar alguns minutos até o encerramento da campanha.');
    }

    console.log(`O comando de parada de campanha foi executado`);
    res.send(`O comando de parada foi enviado com sucesso! Aguarde alguns minutos até o encerramento da campanha.`);
  });
});



// POST route to pause all active campaigns on N8N
app.post('/pausecampaign', (req, res) => {
  db.query('UPDATE campanhas SET emAndamento = 2 WHERE emAndamento = 1', (err, result) => {
    if (err) {
      console.error('Erro ao pausar campanhas:', err);
      return res.status(500).send('Erro no banco de dados. Entre em contato com o suporte.');
    }

    if (result.affectedRows === 0) {
      return res.send('O comando de pausa já foi enviado ou não há campanhas ativas no momento.');
    }

    console.log(`O comando de pausa de campanha foi executado`);
    res.send(`O comando de pausa foi enviado com sucesso! As campanhas serão pausadas em breve.`);
  });
});

// POST route to resume paused campaigns on N8N
app.post('/resumecampaign', (req, res) => {
  db.query('UPDATE campanhas SET emAndamento = 1 WHERE emAndamento = 2', (err, result) => {
    if (err) {
      console.error('Erro ao retomar campanhas:', err);
      return res.status(500).send('Erro no banco de dados. Entre em contato com o suporte.');
    }

    if (result.affectedRows === 0) {
      return res.send('Não há campanhas pausadas para retomar no momento.');
    }

    console.log(`O comando de retomada de campanha foi executado`);
    res.send(`Campanhas retomadas com sucesso!`);
  });
});



// Route to update information to show active campaigns
app.get('/api/campanhas', isAuthenticated, (req, res) => {
  const sql = "SELECT * FROM campanhas WHERE emAndamento = 1";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar campanhas' });
    res.json(result);
  });
});

// END OF CAMPAIGNS CONTROL SECTION


// Public folder for static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Server startup
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
