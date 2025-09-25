// Main imports
const express = require('express');
const app = express(); // Express instance, becomes the main application object
const exprhbs = require('express-handlebars'); // Handlebars module
const path = require('path'); // Native module that deals with paths
const { got } = require('got'); //HTTP client for APIs

// Create connection with MySQL - Using localhost mysql database. When upload to VPS, must create similar database and edit connection data
const mysql = require('mysql2');
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'dominioforce',
  port: 3306,
});


// Middleware that handles form data coming from front end http requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Management, to keep users logged in, cookies, etc.
const session = require('express-session');
app.use(session({
  secret: '$2b$10$/jmPnyRl6qkmHcRH.OpeGeOk5jbES9BLLpD6e4qYNYYXzLwVSAOFS',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,       // <--- Prevents cookie from requiring HTTPS
    httpOnly: true,
    sameSite: 'lax'      // <--- Helps in persistence between pages
  }
}));

// Encryption of passwords
const bcrypt = require('bcryptjs');

// server port
const PORT = process.env.PORT || 5000;

// Middleware to protect private routes
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId != null) {
    console.log(req.session.userName + ' is logged in.');
    return next();
  }
  res.redirect('/login');
}

// Configuration of the Handlebars as template engine
app.engine('handlebars', exprhbs.engine());
app.set('view engine', 'handlebars');

// Connect to database to show campaign information on home
db.connect(function(err) {
    if (err) {
          throw err;  }
           else {    
            console.log('Retrieving information from the database!');  
          }               
        });

// Main route - Protected route of homepage dashboard, including mysql information
// Sets the route to the home page ("/")
// Uses isAuthenticated middleware to ensure the user is logged in
app.get('/', isAuthenticated, (req, res) => {

  // SQL query to fetch campaigns that are in progress (emAndamento = 1)
  const sqlCampanhasAtivas = "SELECT * FROM campanhas WHERE emAndamento = 1";

  // SQL query to fetch data that will be used in the chart (without filter emAndamento)
  const sqlGrafico = "SELECT TipoDeCampanha, leadsAlcancados, Inicio FROM campanhas";

  // Performs the first query: campanhas ativas
  db.query(sqlCampanhasAtivas, function(err, campanhasAtivas) {
    if (err) throw err; // Se houver erro, interrompe e exibe o erro

    // Performs the second query: complete data for the chart
    db.query(sqlGrafico, function(err2, campanhasParaGrafico) {
      if (err2) throw err2; // Se houver erro, interrompe e exibe o erro

      // Maps the results of the second query to a simpler format
      // Each object will have: campaign type, number of leads and start date
      const dadosGrafico = campanhasParaGrafico.map(campanha => ({
        tipo: campanha.TipoDeCampanha,
        leads: campanha.leadsAlcancados,
        inicio: campanha.Inicio
      }));

      // Renderiza o template 'home.handlebars'
      // Envia três variáveis para o template:
      // - name: nome do usuário logado (da sessão)
      // - campanhas: lista de campanhas ativas (emAndamento = 1)
      // - dadosGrafico: dados formatados para o Chart.js, convertidos em JSON
      res.render('home', {
        name: req.session.userName,
        campanhas: campanhasAtivas,
        dadosGrafico: JSON.stringify(dadosGrafico)// Converte o objeto para uma string JSON
      });
    });
  });
});


// Routes - Other protected pages (example: campaigns, FAQ)
app.get('/campanhaProspeccao', isAuthenticated, (req, res) => {
  res.render('campanhaProspeccao');
});

app.get('/faq', isAuthenticated, (req, res) => {
  res.render('faq');
});

// Route to history, with information about completed campaigns
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

// Route to get the list of cities for a specific state
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
});

// POST route to authenticate the user
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM ai_dashboard_users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.send('Error in the database');

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



// Logout route to end the session
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Route to send information to N8N webhook
app.post('/api/enviar-campanha', async (req, res) => {
  const { tipoEmpresa, estado, cidade } = req.body;

  try {
    const response = await got.post('https://n8n.pierrejr.com/webhook/eb9f69a1-8042-4160-b52a-87288c984018', {
      json: { tipoEmpresa, estado, cidade },
      responseType: 'json'
    });

    res.status(200).send('Dados enviados com sucesso!');
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
    res.json(result); // envia os dados como JSON
  });
});

// POST route to stop all active campaigns
app.post('/stopcampaign', (req, res) => {
  // Executes a SQL query that updates all campaigns with stop = 0, marking as stop = 1
  db.query('UPDATE campaigncommands SET stop = 1 WHERE stop = 0', (err, result) => {
    // If there is an error in the execution of the query, returns error 500 and displays in the console
    if (err) {
      console.error('Erro ao parar campanhas:', err);
      return res.status(500).send('Erro no banco de dados');
    }

    // If no line was affected, it means that there were no active campaigns to stop
    if (result.affectedRows === 0) {
      return res.send('Nenhuma campanha ativa encontrada para parar');
    }

    // If campaigns have been updated, displays in the console and sends response to customer
    console.log(`O comando de parada foi executado com sucesso!`);
    res.send(`O comando de parada foi executado com sucesso! Espere um momento antes de iniciar uma nova campanha.`);
  });
});



// Public folder for static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to MySQL!');
  }
});

// server startup
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
