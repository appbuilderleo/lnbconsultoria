require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Para servir o index.html e a pasta assets

// Configuração do Banco de Dados
let connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_COCKROACH;

// Se a string no .env não tiver "DATABASE_URL=", precisamos ler manualmente (fallback)
if (!connectionString) {
    const fs = require('fs');
    try {
        const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').trim();
        if (envContent.startsWith('postgresql://')) {
            connectionString = envContent;
        } else if (envContent.startsWith('DATABASE_URL=')) {
            connectionString = envContent.replace('DATABASE_URL=', '').trim();
        }
    } catch (e) {
        console.error("Erro ao ler .env manualmente", e);
    }
}

const client = new Client({
    connectionString: connectionString,
});

client.connect()
    .then(() => {
        console.log('✅ Conectado ao CockroachDB!');
        return client.query(`
            CREATE TABLE IF NOT EXISTS admin_config (
                id INT PRIMARY KEY,
                senha TEXT NOT NULL
            );
            INSERT INTO admin_config (id, senha) VALUES (1, 'lnb2024') ON CONFLICT DO NOTHING;
        `);
    })
    .catch(err => console.error('❌ Erro ao conectar ao banco:', err));

// Rotas da API

// Login do Admin
app.post('/api/admin/login', async (req, res) => {
    try {
        const { senha } = req.body;
        const result = await client.query('SELECT senha FROM admin_config WHERE id = 1');
        if (result.rows.length > 0 && result.rows[0].senha === senha) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Senha incorreta' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// Alterar Senha do Admin
app.put('/api/admin/senha', async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;
        const result = await client.query('SELECT senha FROM admin_config WHERE id = 1');
        if (result.rows.length === 0 || result.rows[0].senha !== senhaAtual) {
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }
        await client.query('UPDATE admin_config SET senha = $1 WHERE id = 1', [novaSenha]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// 1. Obter todas as vagas
app.get('/api/vagas', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM vagas ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar vagas' });
    }
});

// 2. Criar uma nova vaga
app.post('/api/vagas', async (req, res) => {
    try {
        const { titulo, empresa, desc, categoria, local, tipo, contrato, salario, prazo, contacto, req: requisitos, destaque, publicado, data } = req.body;
        const query = `
            INSERT INTO vagas (titulo, empresa, "desc", categoria, local, tipo, contrato, salario, prazo, contacto, req, destaque, publicado, data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;
        `;
        const values = [titulo, empresa, desc, categoria, local, tipo, contrato, salario, prazo, contacto, requisitos, destaque, publicado, data];
        const result = await client.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar vaga' });
    }
});

// 3. Atualizar uma vaga
app.put('/api/vagas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, empresa, desc, categoria, local, tipo, contrato, salario, prazo, contacto, req: requisitos, destaque, publicado, data } = req.body;
        
        // Vamos atualizar apenas o que for enviado no body
        // Para simplificar, se for atualização completa, usamos a mesma query:
        if (titulo !== undefined) {
             const query = `
                UPDATE vagas SET 
                    titulo = $1, empresa = $2, "desc" = $3, categoria = $4, local = $5, 
                    tipo = $6, contrato = $7, salario = $8, prazo = $9, contacto = $10, 
                    req = $11, destaque = $12, publicado = $13, data = $14
                WHERE id = $15 RETURNING *;
            `;
            const values = [titulo, empresa, desc, categoria, local, tipo, contrato, salario, prazo, contacto, requisitos, destaque, publicado, data, id];
            const result = await client.query(query, values);
            res.json(result.rows[0]);
        } else {
            // Se for apenas para atualizar o status (publicar/despublicar)
            if (publicado !== undefined) {
                const query = `UPDATE vagas SET publicado = $1 WHERE id = $2 RETURNING *;`;
                const result = await client.query(query, [publicado, id]);
                res.json(result.rows[0]);
            } else {
                res.status(400).json({ error: 'Nenhum dado para atualizar' });
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar vaga' });
    }
});

// 4. Eliminar uma vaga
app.delete('/api/vagas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await client.query('DELETE FROM vagas WHERE id = $1', [id]);
        res.json({ message: 'Vaga eliminada com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao eliminar vaga' });
    }
});



// Exportar a app para o Vercel (Serverless)
module.exports = app;

// Iniciar o servidor localmente (apenas se não estiver no Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor a rodar em http://localhost:${PORT}`);
    });
}
