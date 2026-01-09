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
    console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// MIDDLEWARES - ORDEM IMPORTA!
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'Accept'],
    credentials: true
}));

// Handle preflight requests
app.options('*', cors());

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
    // Permitir requisições HEAD sem autenticação para verificação de status
    if (req.method === 'HEAD') {
        return next();
    }

    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        console.log('❌ Requisição sem token:', req.method, req.path);
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken }),
            signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
        });

        if (!verifyResponse.ok) {
            console.log('❌ Token inválido:', sessionToken.substring(0, 10) + '...');
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            console.log('❌ Sessão não válida');
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error.message);
        
        // Se for erro de timeout ou conexão, permitir acesso (modo offline)
        if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
            console.log('⚠️ Portal offline - permitindo acesso');
            req.user = { offline: true };
            return next();
        }
        
        return res.status(500).json({
            error: 'Erro ao verificar autenticação'
        });
    }
}

// ARQUIVOS ESTÁTICOS
const publicPath = path.join(__dirname, 'public');

// Criar pasta public se não existir
if (!fs.existsSync(publicPath)) {
    console.log('📁 Criando pasta public/...');
    fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
    }
}));

// HEALTH CHECK - SEM AUTENTICAÇÃO
app.get('/health', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('transportadoras')
            .select('*', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            timestamp: new Date().toISOString(),
            service: 'transportadoras',
            transportadoras: count || 0
        });
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        res.status(500).json({
            status: 'unhealthy',
            database: 'error',
            timestamp: new Date().toISOString(),
            service: 'transportadoras',
            error: error.message
        });
    }
});

// HEAD request para verificar conexão - ANTES da autenticação
app.head('/api/transportadoras', (req, res) => {
    res.status(200).end();
});

// APLICAR AUTENTICAÇÃO APENAS NAS ROTAS DA API (exceto HEAD)
app.use('/api', verificarAutenticacao);

// ============================================
// ROTAS DA API - TRANSPORTADORAS
// ============================================

// Listar todas as transportadoras
app.get('/api/transportadoras', async (req, res) => {
    try {
        console.log('📋 Buscando transportadoras...');
        
        const { data, error } = await supabase
            .from('transportadoras')
            .select('*')
            .order('nome', { ascending: true });

        if (error) {
            console.error('❌ Erro ao buscar transportadoras:', error);
            throw error;
        }
        
        console.log(`✅ ${data?.length || 0} transportadoras encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro na rota GET /transportadoras:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar transportadoras',
            message: error.message
        });
    }
});

// Buscar transportadora específica
app.get('/api/transportadoras/:id', async (req, res) => {
    try {
        console.log('🔍 Buscando transportadora:', req.params.id);
        
        const { data, error } = await supabase
            .from('transportadoras')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            console.log('❌ Transportadora não encontrada:', req.params.id);
            return res.status(404).json({ error: 'Transportadora não encontrada' });
        }
        
        console.log('✅ Transportadora encontrada:', data.nome);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro na rota GET /transportadoras/:id:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar transportadora',
            message: error.message
        });
    }
});

// Criar nova transportadora
app.post('/api/transportadoras', async (req, res) => {
    try {
        const { nome, telefones, celulares, email, regioes, estados } = req.body;

        console.log('➕ Criando transportadora:', nome);

        if (!nome) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const transportadoraData = {
            nome: nome.trim().toUpperCase(),
            telefones: telefones || [],
            celulares: celulares || [],
            email: email ? email.trim().toLowerCase() : '',
            regioes: regioes || [],
            estados: estados || [],
            timestamp: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('transportadoras')
            .insert([transportadoraData])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar transportadora:', error);
            throw error;
        }
        
        console.log('✅ Transportadora criada:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro na rota POST /transportadoras:', error);
        res.status(500).json({ 
            error: 'Erro ao criar transportadora',
            message: error.message
        });
    }
});

// Atualizar transportadora
app.put('/api/transportadoras/:id', async (req, res) => {
    try {
        const { nome, telefones, celulares, email, regioes, estados } = req.body;

        console.log('✏️ Atualizando transportadora:', req.params.id);

        if (!nome) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const transportadoraData = {
            nome: nome.trim().toUpperCase(),
            telefones: telefones || [],
            celulares: celulares || [],
            email: email ? email.trim().toLowerCase() : '',
            regioes: regioes || [],
            estados: estados || [],
            timestamp: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('transportadoras')
            .update(transportadoraData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao atualizar transportadora:', error);
            return res.status(404).json({ error: 'Transportadora não encontrada' });
        }
        
        console.log('✅ Transportadora atualizada:', data.nome);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro na rota PUT /transportadoras/:id:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar transportadora',
            message: error.message
        });
    }
});

// Deletar transportadora
app.delete('/api/transportadoras/:id', async (req, res) => {
    try {
        console.log('🗑️ Deletando transportadora:', req.params.id);
        
        const { error } = await supabase
            .from('transportadoras')
            .delete()
            .eq('id', req.params.id);

        if (error) {
            console.error('❌ Erro ao deletar transportadora:', error);
            throw error;
        }
        
        console.log('✅ Transportadora deletada');
        res.status(204).end();
    } catch (error) {
        console.error('❌ Erro na rota DELETE /transportadoras/:id:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir transportadora',
            message: error.message
        });
    }
});

// ============================================
// ROTAS PRINCIPAIS
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// 404
app.use((req, res) => {
    console.log('❌ 404 - Rota não encontrada:', req.method, req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path
    });
});

// TRATAMENTO DE ERROS
app.use((error, req, res, next) => {
    console.error('❌ Erro interno:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ========================================');
    console.log('✅ Servidor Transportadoras ONLINE');
    console.log(`✅ Porta: ${PORT}`);
    console.log(`✅ Database: Conectado ao Supabase`);
    console.log(`✅ Autenticação: Ativa (Portal)`);
    console.log(`📝 Logs: acessos.log`);
    console.log('🚀 ========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM recebido, encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado');
        process.exit(0);
    });
});

// Teste de conexão com Supabase ao iniciar
(async () => {
    try {
        const { count, error } = await supabase
            .from('transportadoras')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error('❌ Erro ao conectar com Supabase:', error.message);
        } else {
            console.log(`✅ Conexão com Supabase verificada (${count || 0} transportadoras)`);
        }
    } catch (error) {
        console.error('❌ Erro ao testar conexão:', error.message);
    }
})();
