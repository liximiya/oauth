const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

function readUsers() {
  ensureStorage();
  const raw = fs.readFileSync(USERS_FILE, 'utf8');

  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.users)) {
      const fixed = { users: [] };
      writeUsers(fixed);
      return fixed;
    }
    return data;
  } catch {
    const fixed = { users: [] };
    writeUsers(fixed);
    return fixed;
  }
}

function writeUsers(data) {
  ensureStorage();
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function findUser({ login, email, id }) {
  const { users } = readUsers();

  if (id) {
    return users.find((user) => user.id === id) || null;
  }

  if (login) {
    return users.find((user) => user.login.toLowerCase() === login.toLowerCase()) || null;
  }

  if (email) {
    return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
  }

  return null;
}

function addUser(user) {
  const data = readUsers();
  data.users.push(user);
  writeUsers(data);
  return user;
}

function updateUser(id, updates) {
  const data = readUsers();
  const index = data.users.findIndex((user) => user.id === id);

  if (index === -1) {
    return null;
  }

  data.users[index] = { ...data.users[index], ...updates };
  writeUsers(data);
  return data.users[index];
}

function deleteUser(id) {
  const data = readUsers();
  const nextUsers = data.users.filter((user) => user.id !== id);

  if (nextUsers.length === data.users.length) {
    return false;
  }

  writeUsers({ users: nextUsers });
  return true;
}

module.exports = {
  readUsers,
  writeUsers,
  findUser,
  addUser,
  updateUser,
  deleteUser,
};
