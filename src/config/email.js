import * as brevo from '@getbrevo/brevo'; 
import "../config/env.js"; 
 
// Initialize Brevo API client 
const apiInstance = new brevo.TransactionalEmailsApi(); 
 
// Configure API key authentication 
const rawKey = process.env.BREVO_API_KEY; 
const apiKeyValue = typeof rawKey === 'string' ? rawKey.trim() : ''; 
 
if (!apiKeyValue) { 
	 console.warn('⚠️ BREVO_API_KEY is not set (email sending will fail)'); 
} else { 
	 // Prefer the SDK helper if available 
	 if (typeof apiInstance.setApiKey === 'function' && brevo.TransactionalEmailsApiApiKeys?.apiKey) { 
	 	 apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKeyValue); 
	 } else if (apiInstance.authentications?.apiKey) { 
	 	 apiInstance.authentications.apiKey.apiKey = apiKeyValue; 
	 } else if (apiInstance.authentications?.['apiKey']) { 
	 	 apiInstance.authentications['apiKey'].apiKey = apiKeyValue; 
	 } else { 
	 	 console.warn('⚠️ Brevo SDK authentication hook not found; email sending may fail'); 
	 } 
} 
 
export default apiInstance;
