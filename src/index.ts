interface Env {
	APPLICATION_TOKEN?: string | null;
}

interface CloudflareResponse {
	success: boolean;
	errors?: Error[];
	result?: Result | Result[];
}

interface Result {
	id?: string;
}

interface Error {
	message: string;
}

enum UpdateStatus {
	OK = 200,
	BAD_REQUEST = 400,
	INTERNAL_SERVER_ERROR = 500,
}

class CloudflareDnsUpdater {
	public static CLOUDFLARE_URL = 'https://api.cloudflare.com/client/v4/zones';
	private apiToken: string = '';
	private ip: string = '';
	private ipType: string = '';
	private hostnames: string[] = [];

	constructor() {}

	public static getBasicAuthCredentials(authHeader: string): { username: string; password: string } | null {
		if (!authHeader?.startsWith('Basic ')) {
			return null;
		}
		const credentials = atob(authHeader.substring(6));
		const [username, password] = credentials.split(':');
		return username && password ? { username, password } : null;
	}

	public static isIPv4(ipv4: string): boolean {
		const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;
		return ipv4Regex.test(ipv4);
	}

	public static isIPv6(ipv6: string): boolean {
		const ipv6Regex = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^((?:[a-fA-F0-9]{1,4}:){1,7}|:)((:[a-fA-F0-9]{1,4}){1,7}|:)$/;
		return ipv6Regex.test(ipv6);
	}

	private async fetch(parameters: string, options: RequestInit): Promise<CloudflareResponse> {
		options.headers = {
			...options.headers,
			Authorization: `Bearer ${this.apiToken}`,
			'Content-Type': 'application/json',
		};
		const response = await fetch(CloudflareDnsUpdater.CLOUDFLARE_URL + parameters, options);
		return await response.json();
	}

	private extractError(content: CloudflareResponse): string {
		return Array.isArray(content.errors) ? content.errors[0]?.message || 'Unknown error' : 'Unknown error';
	}

	private async getRecordId(parameters: string): Promise<{ success: boolean; id: string | null; error: string }> {
		const content = await this.fetch(parameters, {});
		if (!content.success) {
			return { success: false, id: null, error: this.extractError(content) };
		}
		const id = Array.isArray(content.result) ? content.result[0]?.id || null : content.result?.id || null;
		return { success: true, id, error: '' };
	}

	private async updateDnsRecord(hostname: string, parameters: string): Promise<{ success: boolean; error: string }> {
		const options = {
			method: 'PUT',
			body: JSON.stringify({ name: hostname, type: this.ipType, content: this.ip }),
		};
		const content = await this.fetch(parameters, options);
		if (!content.success) return { success: false, error: this.extractError(content) };
		return { success: true, error: '' };
	}

	getContent(request: Request): { success: boolean; error: string } {
		const url = new URL(request.url);
		const ip = url.searchParams.get('ip')?.trim();
		const hostname = url.searchParams.get('hostname');
		const base64 = request.headers.get('authorization') || '';
		const credentials = CloudflareDnsUpdater.getBasicAuthCredentials(base64);

		if (!credentials?.password) return { success: false, error: 'API token required' };
		if (!hostname) return { success: false, error: 'Hostname required' };
		if (!ip) return { success: false, error: 'IP required' };

		const type = CloudflareDnsUpdater.isIPv4(ip) ? 'A' : CloudflareDnsUpdater.isIPv6(ip) ? 'AAAA' : null;
		if (!type) return { success: false, error: 'Invalid IP format' };

		this.apiToken = credentials.password;
		this.ip = ip;
		this.ipType = type;
		this.hostnames = hostname.split(',');
		return { success: true, error: '' };
	}

	async update(): Promise<{ status: UpdateStatus; message: string }> {
		let record;
		let message = '';
		let updateStatus: UpdateStatus = UpdateStatus.OK;

		const errors: string[] = [];
		const successes: string[] = [];
		const zoneIdCache = new Map<string, string>();

		try {
			for (let hostname of this.hostnames) {
				if ((hostname = hostname.trim()) === '') continue;

				const domain = hostname.includes('.') ? hostname.split('.').slice(1).join('.') : hostname;
				let zoneId = zoneIdCache.get(domain);
				if (!zoneId) {
					record = await this.getRecordId(`?name=${domain}`);
					if (!record.success) {
						errors.push(`Error: zone_id fetching for ${domain} ${record.error}`);
						continue;
					}
					if (!record.id) {
						errors.push(`Error: zone_id not found for ${domain}`);
						continue;
					}
					zoneId = record.id;
					zoneIdCache.set(domain, zoneId);
				}

				let dnsRecordParam = `/${zoneId}/dns_records?type=${this.ipType}&name=${hostname}`;
				record = await this.getRecordId(dnsRecordParam);
				if (!record.success) {
					errors.push(`Error: dns_record_id fetching for ${hostname} ${record.error}`);
					continue;
				}
				if (!record.id) {
					errors.push(`Error: dns_record_id not found for ${hostname}`);
					continue;
				}

				const dnsRecordId = record.id;
				dnsRecordParam = `/${zoneId}/dns_records/${dnsRecordId}`;
				record = await this.updateDnsRecord(hostname, dnsRecordParam);
				if (!record.success) {
					errors.push(`Error: updating for ${hostname} ${record.error}`);
					continue;
				}
				successes.push(`Success: updating ${hostname} ${this.ip} ${this.ipType}`);
			}

			if (errors.length > 0) {
				message = errors.join('\n');
				updateStatus = UpdateStatus.BAD_REQUEST;
			}

			if (successes.length > 0) {
				if (message.length > 0) message += '\n';
				message = `${message}${successes.join('\n')}`;
			}
		} catch (error) {
			console.log('Internal server error:', {
				request: `${this.hostnames} ${this.ip} ${this.ipType}`,
				stack: error,
			});
			message = 'Internal Server Error';
			updateStatus = UpdateStatus.INTERNAL_SERVER_ERROR;
		}
		return { status: updateStatus, message };
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (!new URL(request.url).pathname.endsWith('/update')) {
			return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain' } });
		}

		const applicationToken = env.APPLICATION_TOKEN;
		if (applicationToken) {
			const base64 = request.headers.get('authorization') || '';
			const credentials = CloudflareDnsUpdater.getBasicAuthCredentials(base64);
			if (!credentials?.username || credentials.username !== applicationToken) {
				return new Response('Unauthorized\n', { status: 401, headers: { 'Content-Type': 'text/plain' } });
			}
		}

		const cf = new CloudflareDnsUpdater();
		const { success, error } = cf.getContent(request);
		if (!success) {
			return new Response(error + '\n', { status: 400, headers: { 'Content-Type': 'text/plain' } });
		}

		const { status, message } = await cf.update();
		return new Response(message + '\n', { status: status, headers: { 'Content-Type': 'text/plain' } });
	},
} satisfies ExportedHandler<Env>;
