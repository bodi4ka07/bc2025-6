const { program } = require('commander');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Налаштування параметрів командного рядка
program
  .requiredOption('-h, --host <host>', 'Server host address')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <path>', 'Path to cache directory');

program.parse(process.argv);
const options = program.opts();

// Створення директорії кешу
if (!fs.existsSync(options.cache)) {
  fs.mkdirSync(options.cache, { recursive: true });
  console.log(`Cache directory created: ${options.cache}`);
}

// Ініціалізація Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, options.cache);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// Сховище для інвентарю (в пам'яті)
let inventory = [];
let nextId = 1;

// Middleware для перевірки методів
app.use((req, res, next) => {
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  next();
});

// POST /register - Реєстрація нового пристрою
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;

  // Перевірка обов'язкового поля
  if (!inventory_name) {
    return res.status(400).json({ error: 'Inventory name is required' });
  }

  // Створення нового запису
  const newItem = {
    id: nextId++,
    inventory_name: inventory_name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  inventory.push(newItem);

  res.status(201).json({
    message: 'Item registered successfully',
    item: newItem
  });
});

// GET /inventory - Отримання списку всіх речей
app.get('/inventory', (req, res) => {
  const inventoryWithPhotos = inventory.map(item => ({
    ...item,
    photo_url: item.photo 
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` 
      : null
  }));

  res.status(200).json(inventoryWithPhotos);
});

// GET /inventory/:id - Отримання інформації про конкретну річ
app.get('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const itemWithPhoto = {
    ...item,
    photo_url: item.photo 
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` 
      : null
  };

  res.status(200).json(itemWithPhoto);
});

// PUT /inventory/:id - Оновлення імені або опису
app.put('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Оновлення полів
  if (req.body.inventory_name !== undefined) {
    item.inventory_name = req.body.inventory_name;
  }
  if (req.body.description !== undefined) {
    item.description = req.body.description;
  }

  res.status(200).json({
    message: 'Item updated successfully',
    item: item
  });
});

// GET /inventory/:id/photo - Отримання фото
app.get('/inventory/:id/photo', (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!item.photo) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  const photoPath = path.join(options.cache, item.photo);

  if (!fs.existsSync(photoPath)) {
    return res.status(404).json({ error: 'Photo file not found' });
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath);
});

// PUT /inventory/:id/photo - Оновлення фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const id = parseInt(req.params.id);
  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Видалення старого фото
  if (item.photo) {
    const oldPhotoPath = path.join(options.cache, item.photo);
    if (fs.existsSync(oldPhotoPath)) {
      fs.unlinkSync(oldPhotoPath);
    }
  }

  // Оновлення фото
  item.photo = req.file ? req.file.filename : null;

  res.status(200).json({
    message: 'Photo updated successfully',
    item: item
  });
});

// DELETE /inventory/:id - Видалення речі
app.delete('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const itemIndex = inventory.findIndex(i => i.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const item = inventory[itemIndex];

  // Видалення фото
  if (item.photo) {
    const photoPath = path.join(options.cache, item.photo);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
  }

  // Видалення зі списку
  inventory.splice(itemIndex, 1);

  res.status(200).json({
    message: 'Item deleted successfully',
    id: id
  });
});

// GET /RegisterForm.html - Веб форма реєстрації
app.get('/RegisterForm.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

// GET /SearchForm.html - Веб форма пошуку
app.get('/SearchForm.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

// POST /search - Пошук пристрою за ID
app.post('/search', (req, res) => {
  const id = parseInt(req.body.id);
  const hasPhoto = req.body.has_photo === 'true';

  const item = inventory.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  let description = item.description;
  
  // Додати посилання на фото до опису, якщо потрібно
  if (hasPhoto && item.photo) {
    const photoUrl = `http://${options.host}:${options.port}/inventory/${item.id}/photo`;
    description += ` [Фото: ${photoUrl}]`;
  }

  const result = {
    id: item.id,
    inventory_name: item.inventory_name,
    description: description,
    photo_url: item.photo 
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` 
      : null
  };

  res.status(200).json(result);
});

// Запуск сервера
app.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}/`);
});