const express = require('express');
const app = express();// Create an instance of express
const exprhbs = require('express-handlebars');// Import express-handlebars, which is a templating engine for Express Module

const path = require('path');// Node.js module for handling file paths

const { got } = require('got');// Import got for making HTTP requests

const PORT = process.env.PORT || 5000;





// Set Handlebars as the view engine
app.engine('handlebars', exprhbs.engine());
app.set('view engine', 'handlebars');



// Variables to be used in Handlebars templates
const greettingText = "Seja bem vindo ao painel de controle do seu agente de IA!";



// Set Handlebars routes to main pages
app.get('/', (req, res) => {
    res.render('home', { text: greettingText });// Pass the variable to the template
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

app.get('/faq', (req, res) => {
    res.render('faq');
});



/*Set Handlebars POST routes
app.post('dashboard', (req, res) => {
    console.log({tipoEmpresa, estado, cidade});
    res.send('Formulário recebido com sucesso!');
});
*/



// Set static folder
app.use(express.static(path.join(__dirname, 'public')));




app.listen(PORT, () => console.log(`Server running on port ${PORT}`));