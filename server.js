require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3003;

// CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// MIDDLEWARES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REGISTRO DE ACESSOS SILENCIOSO
const logFilePath = path.join(__dirname, 'acessos.log');
let accessCount = 0;
let uniqueIPs = new Set();

function registrarAcesso(req, res, next) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress;

    const cleanIP = clientIP.replace('::ffff:', '');
    const logEntry = `[${new Date().toISOString()}] ${cleanIP} - ${req.method} ${req.path}\n`;

    fs.appendFile(logFilePath, logEntry, () => {});
    
    accessCount++;
    uniqueIPs.add(cleanIP);
    
    next();
}

app.use(registrarAcesso);

// Relatório periódico (a cada 1 hora)
setInterval(() => {
    if (accessCount > 0) {
        console.log(`📊 Última hora: ${accessCount} requisições de ${uniqueIPs.size} IPs únicos`);
        accessCount = 0;
        uniqueIPs.clear();
    }
}, 3600000);

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        return res.status(500).json({
            error: 'Erro ao verificar autenticação'
        });
    }
}

// ARQUIVOS ESTÁTICOS
const publicPath = path.join(__dirname, 'public');

app.use(express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('transportadoras')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            timestamp: new Date().toISOString()
        });
    }
});

// ROTAS DA API
app.use('/api', verificarAutenticacao);

app.head('/api/transportadoras', (req, res) => {
    res.status(200).end();
});

// Listar transportadoras
app.get('/api/transportadoras', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transportadoras')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar transportadoras'
        });
    }
});

// Buscar transportadora específica
app.get('/api/transportadoras/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transportadoras')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Transportadora não encontrada' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar transportadora'
        });
    }
});

// Criar transportadora
app.post('/api/transportadoras', async (req, res) => {
    try {
        const { nome, telefones, celulares, email, regioes, estados } = req.body;

        if (!nome || !email) {
            return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('transportadoras')
            .insert([{
                nome: nome.trim(),
                telefones: telefones || [],
                celulares: celulares || [],
                email: email.trim().toLowerCase(),
                regioes: regioes || [],
                estados: estados || [],
                timestamp: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao criar transportadora'
        });
    }
});

// Atualizar transportadora
app.put('/api/transportadoras/:id', async (req, res) => {
    try {
        const { nome, telefones, celulares, email, regioes, estados } = req.body;

        if (!nome || !email) {
            return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('transportadoras')
            .update({
                nome: nome.trim(),
                telefones: telefones || [],
                celulares: celulares || [],
                email: email.trim().toLowerCase(),
                regioes: regioes || [],
                estados: estados || [],
                timestamp: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Transportadora não encontrada' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao atualizar transportadora'
        });
    }
});

// Deletar transportadora
app.delete('/api/transportadoras/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('transportadoras')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao excluir transportadora'
        });
    }
});

// ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// 404
app.use((req, res) => {
    res.status(404).json({
        error: '404 - Rota não encontrada'
    });
});

// TRATAMENTO DE ERROS
app.use((error, req, res, next) => {
    res.status(500).json({
        error: 'Erro interno do servidor'
    });
});

// INICIAR SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`✅ Database: Conectado`);
    console.log(`✅ Autenticação: Ativa`);
    console.log(`📝 Logs salvos em: acessos.log\n`);
});

// Verificar pasta public
if (!fs.existsSync(publicPath)) {
    console.error('⚠️  Pasta public/ não encontrada!');
}
