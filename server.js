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
    secure: true, /*process.env.COOKIE_SECURE,*/  //use false for local development and true for production!
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
  res.render('campanhaProspeccao');
});

app.get('/faq', isAuthenticated, (req, res) => {
  res.render('faq');
});

app.get('/prospection-success', isAuthenticated, (req, res) => {
  res.render('prospection-success');
}
)

app.get('/history', isAuthenticated, (req, res) => {
  const sqlCampanhasFinalizadas = "SELECT * FROM campanhas WHERE emAndamento = 0";

  db.query(sqlCampanhasFinalizadas, (err, campanhasFinalizadas) => {
    if (err) throw err;

    res.render('history', {
      name: req.session.userName,
      campanhas: campanhasFinalizadas
    });
  });
});

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
  res.render('login');
  console.log(`Someone's just accessed the login page!`);
});

/* DEPRECATED OLD POST route to authenticate the user
app.post('/login', (req, res) => {
  const { email, password } = req.body; console.log(req.body);

  db.query('SELECT * FROM ai_dashboard_users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('Erro no banco de dados:', err);
      return res.send('Erro no banco de dados');
    }

    if (results.length === 0) {
      return res.send('User not found');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.save(() => {
        res.redirect('/');
      });      
      console.log(`User ${user.name} successfully logged in!`);
    } else {
      res.send('Senha incorreta');
    }
  });
}); 
*/

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
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Route to send information to N8N webhook
app.post('/api/enviar-campanha', async (req, res) => {
  const { tipoEmpresa, estado, cidade } = req.body; // destructure the request body

  try {
    const response = await got.post(process.env.N8N_WEBHOOK_1, {
      json: { tipoEmpresa, estado, cidade },
      responseType: 'json'
    });

    res.status(200).send('Dados enviados com sucesso!');
    //res.redirect('/prospection-success');
  } catch (error) {
    console.error('Erro ao enviar para N8N:', error.message);
    res.status(500).send('Erro ao processar os dados.');
  }
});

// Route to update information to show active campaigns
app.get('/api/campanhas', isAuthenticated, (req, res) => {
  const sql = "SELECT * FROM campanhas WHERE emAndamento = 1";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar campanhas' });
    res.json(result);
  });
});

// POST route to stop all active campaigns
app.post('/stopcampaign', (req, res) => {
  db.query('UPDATE campaigncommands SET stop = 1 WHERE stop = 0', (err, result) => {
    if (err) {
      console.error('Erro ao parar campanhas:', err);
      return res.status(500).send('Erro no banco de dados');
    }

    if (result.affectedRows === 0) {
      return res.send('Nenhuma campanha ativa encontrada para parar');
    }

    console.log(`O comando de parada foi executado com sucesso!`);
    res.send(`O comando de parada foi executado com sucesso! Espere um momento antes de iniciar uma nova campanha.`);
  });
});

// Public folder for static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Server startup
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
