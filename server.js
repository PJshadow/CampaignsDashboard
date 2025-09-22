// Main imports
const express = require('express');
const app = express(); // Express instance, becomes the main application object
const exprhbs = require('express-handlebars'); // Handlebars module
const path = require('path'); // Native module that deals with paths
const { got } = require('got'); //HTTP client for APIs

// Create connection with MySQL - Using localhost mysql database. When upload to VPS, create similar database and edit connection data
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
  secret: 'SuperSecretKey',
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
  if (err) throw err;
    console.log('Retrieving information from the database!');                    
});

// Main route - Protected route of homepage dashboard, including mysql information
app.get('/', isAuthenticated, (req, res) => {
    var sql = "SELECT * FROM campanhas WHERE emAndamento = 1";
    db.query(sql, function(err, result, fields){
    if (err) throw err;
    console.log(result); // Redirect to dashboard if logged in, because the line calls the isAuthenticated middleware
  res.render('home', { name: req.session.userName, campanhas: result });
  });
});
app.get('/home', isAuthenticated, (req, res) => {
    var sql = "SELECT * FROM campanhas WHERE emAndamento = 1";
    db.query(sql, function(err, result, fields){
    if (err) throw err;
    console.log(result); // Redirect to dashboard if logged in, because the line calls the isAuthenticated middleware
  res.render('home', { name: req.session.userName, campanhas: result });
  });
});

// Routes - Other protected pages (example: campaigns, FAQ)
app.get('/campanhaProspeccao', isAuthenticated, (req, res) => {
  res.render('campanhaProspeccao');
});

app.get('/faq', isAuthenticated, (req, res) => {
  res.render('faq');
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
        res.redirect('/home');
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
