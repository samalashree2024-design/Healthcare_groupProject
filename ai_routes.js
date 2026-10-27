// Add once to server.js, before app.listen(): require('./ai_routes')(app);
// Uses Node 18+ built-in fetch. Demo endpoints: LOCAL MACHINE ONLY, no auth.
module.exports = function registerResearchRoutes(app) {
    const BASE = 'http://127.0.0.1:8000';
    async function forward(req, res, path, method='GET') {
        try {
            const config = { method, headers: { 'Accept': 'application/json' } };
            if (method === 'POST') {
                config.headers['Content-Type'] = 'application/json';
                config.body = JSON.stringify(req.body);
            }
            const response = await fetch(BASE + path, config);
            const data = await response.json();
            res.status(response.status).json(data);
        } catch (error) {
            console.error('Local Python research API unavailable:', error.message);
            res.status(503).json({ detail: 'Python service unavailable. Start uvicorn unified_api:app --host 127.0.0.1 --port 8000.' });
        }
    }
    app.get('/api/research/health', (req,res)=>forward(req,res,'/health'));
    app.get('/api/research/patients', (req,res)=>forward(req,res,'/patients'));
    app.get('/api/research/patients/:id/history', (req,res)=>forward(req,res,'/patients/'+encodeURIComponent(req.params.id)+'/history?limit=30'));
    app.post('/api/research/check', (req,res)=>forward(req,res,'/check-prescription','POST'));
    app.get('/api/research/models', (req,res)=>forward(req,res,'/models'));
    app.get('/api/research/models/:name/schema', (req,res)=>forward(req,res,'/models/'+encodeURIComponent(req.params.name)+'/schema'));
    app.post('/api/research/predict', (req,res)=>forward(req,res,'/predict','POST'));
};
