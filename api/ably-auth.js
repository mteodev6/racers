const Ably = require('ably');

module.exports = async function handler(req, res) {
    // 1. Initialize the Ably backend client using your hidden Vercel variable
    const client = new Ably.Rest(process.env.ABLY_API_KEY);

    // 2. Grab the player's ID from the URL, or generate a random one
    const clientId = req.query.clientId || 'guest_' + Math.random().toString(36).substr(2, 6);

    try {
        // 3. Create a temporary Token Request for this specific player
        const tokenRequestData = await client.auth.createTokenRequest({ clientId: clientId });
        
        // 4. Send the temporary token back to the frontend
        res.status(200).json(tokenRequestData);
    } catch (error) {
        res.status(500).json({ error: 'Error generating Ably token' });
    }
};
