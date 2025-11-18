const { program } = require('commander');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc'); 
const swaggerUi = require('swagger-ui-express');

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

// Swagger конфігурація
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Service API',
      version: '1.0.0',
      description: 'API для управління інвентарем',
    },
    servers: [
      {
        url: `http://${options.host}:${options.port}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./main.js'], // Шлях до файлу з коментарями
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Ініціалізація Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     description: Дозволяє зареєструвати новий пристрій з фото через веб форму
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Ім'я пристрою (обов'язково)
 *                 example: Laptop Asus
 *               description:
 *                 type: string
 *                 description: Опис пристрою
 *                 example: Gaming laptop with RTX 4060
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото пристрою
 *     responses:
 *       201:
 *         description: Пристрій успішно зареєстровано
 *       400:
 *         description: Не вказано обов'язкове поле inventory_name
 */
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


/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримання списку всіх пристроїв
 *     description: Повертає список усіх інвентаризованих речей з посиланнями на фото
 *     responses:
 *       200:
 *         description: Список пристроїв
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   inventory_name:
 *                     type: string
 *                     example: Laptop Asus
 *                   description:
 *                     type: string
 *                     example: Gaming laptop
 *                   photo:
 *                     type: string
 *                     example: 1763292699311-6194e9d399fc98.99594855_1_1.jpg
 *                   photo_url:
 *                     type: string
 *                     example: http://localhost:8080/inventory/1/photo
 */
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

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримання інформації про конкретний пристрій
 *     description: Повертає детальну інформацію про пристрій за його ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ідентифікатор пристрою
 *     responses:
 *       200:
 *         description: Інформація про пристрій
 *       404:
 *         description: Пристрій не знайдено
 */
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


/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлення імені або опису пристрою
 *     description: Дозволяє оновити ім'я та/або опис існуючого пристрою
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ідентифікатор пристрою
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 example: Updated Laptop Name
 *               description:
 *                 type: string
 *                 example: Updated description
 *     responses:
 *       200:
 *         description: Пристрій успішно оновлено
 *       404:
 *         description: Пристрій не знайдено
 */
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


/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання фото пристрою
 *     description: Повертає зображення пристрою
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ідентифікатор пристрою
 *     responses:
 *       200:
 *         description: Зображення пристрою
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Пристрій або фото не знайдено
 */
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

  const photoPath = path.join(__dirname, options.cache, item.photo);

  if (!fs.existsSync(photoPath)) {
    return res.status(404).json({ error: 'Photo file not found' });
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath);
});


/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлення фото пристрою
 *     description: Дозволяє замінити фото існуючого пристрою
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ідентифікатор пристрою
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Нове фото пристрою
 *     responses:
 *       200:
 *         description: Фото успішно оновлено
 *       404:
 *         description: Пристрій не знайдено
 */
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

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалення пристрою
 *     description: Видаляє пристрій зі списку інвентарю
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Унікальний ідентифікатор пристрою
 *     responses:
 *       200:
 *         description: Пристрій успішно видалено
 *       404:
 *         description: Пристрій не знайдено
 */
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


/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук пристрою за ID
 *     description: Шукає пристрій за серійним номером з можливістю додавання посилання на фото в опис
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Серійний номер (ID) пристрою
 *                 example: 1
 *               has_photo:
 *                 type: string
 *                 description: Додати посилання на фото до опису (true/false)
 *                 example: true
 *     responses:
 *       200:
 *         description: Пристрій знайдено
 *       404:
 *         description: Пристрій не знайдено
 */
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