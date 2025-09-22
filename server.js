// Main imports
const express = require('express');
const app = express(); // Instância do Express
const exprhbs = require('express-handlebars'); // Motor de templates Handlebars
const path = require('path'); // Módulo nativo para lidar com caminhos
const { got } = require('got'); // Cliente HTTP (se você estiver usando para chamadas externas)

// Connection with MySQL - Using localhost mysql database
const mysql = require('mysql2');
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'dominioforce',
  port: 3306
});

// Middleware to read data from forms
app.use(express.urlencoded({ extended: true }));

// Session Management, to keep users logged in, cookies, etc.
const session = require('express-session');
app.use(session({
  secret: 'SuperSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,       // <--- Impede que o cookie exija HTTPS
    httpOnly: true,
    sameSite: 'lax'      // <--- Ajuda na persistência entre páginas
  }
}));

// Middleware to verify session in each request (for debugging purposes)
app.use((req, res, next) => {
  console.log('Current Session:', req.session);
  next();
});


// Encryption of passwords
const bcrypt = require('bcryptjs');

// server port
const PORT = process.env.PORT || 5000;

// Middleware to protect private routes
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId != null) {
    return next();
  }
  res.redirect('/login');
}


// Configuration of the Handlebars as template engine
app.engine('handlebars', exprhbs.engine());
app.set('view engine', 'handlebars');

// Welcome text for home and dashboard
const greettingText = "Seja bem vindo ao painel de controle do seu agente de IA!";


// Main route - Protected route of homepage dashboard
app.get('/', isAuthenticated, (req, res) => { // Redirect to dashboard if logged in, because the line calls the isAuthenticated middleware
  res.render('home', { name: req.session.userName });
});
app.get('/home', isAuthenticated, (req, res) => { // Redirect to dashboard if logged in, because the line calls the isAuthenticated middleware
  res.render('home', { name: req.session.userName });
});

// Other protected pages (example: campaigns, FAQ)
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
    if (err) return res.send('Erro no banco de dados');

    if (results.length === 0) {
      return res.send('Usuário não encontrado');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.save(() => {
        res.redirect('/home');
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

// POST route to process form in dashboard (if applicable)
app.post('/', isAuthenticated, (req, res) => {
  const { tipoEmpresa, estado, cidade } = req.body;
  console.log({ tipoEmpresa, estado, cidade });
  res.send('Formulário recebido com sucesso!');
});

// Public folder for static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

db.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err.message);
    process.exit(1);
  } else {
    console.log('Conectado ao MySQL com sucesso!');
  }
});


// server startup
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
