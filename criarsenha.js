//type the user's password below and run the script to get the encrypted version that will be used in the mysql database
const bcrypt = require('bcryptjs');
bcrypt.hash('DigiteASenhaAqui', 10).then(console.log);


//compares the password with the encrypted version
//console.log(bcrypt.compareSync('DigiteASenhaAqui', '$2b$10$.MiEoQ7h65DH9nYzr1QFZuou8UKdGYiPzdQmaSVN9fJE2xkZ/zIGK'));
