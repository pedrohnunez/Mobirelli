// Função serverless da Vercel — consulta dados de um veículo pela placa.
// Fica no servidor de propósito: a chave da API não pode ir pro código do site
// (senão qualquer pessoa consegue ver e usar sua cota gratuita).
//
// Configure na Vercel (Project Settings > Environment Variables):
//   APIBRASIL_DEVICE_TOKEN
//   APIBRASIL_BEARER_TOKEN
// (gerados de graça em https://apibrasil.io — plano free: 100 consultas/dia)

export default async function handler(req, res) {
  const placa = (req.query.placa || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  if (!placa || placa.length < 7) {
    res.status(400).json({ erro: "Informe uma placa válida." });
    return;
  }

  const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN;
  const bearerToken = process.env.APIBRASIL_BEARER_TOKEN;

  if (!deviceToken || !bearerToken) {
    res.status(503).json({
      erro: "Consulta de placa ainda não configurada. Peça pro administrador cadastrar a chave da API na Vercel.",
    });
    return;
  }

  try {
    const upstream = await fetch("https://gateway.apibrasil.io/api/v2/vehicles/dados", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        DeviceToken: deviceToken,
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ placa }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({ erro: data?.message || "Não foi possível consultar essa placa agora." });
      return;
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ erro: "Falha ao contatar o serviço de consulta de placa." });
  }
}
