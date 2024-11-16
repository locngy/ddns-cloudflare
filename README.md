# Cloudflare DNS Updater

A Cloudflare DNS Updater for managing DNS records (A and AAAA) via Cloudflare's API. This tool handles dynamic DNS updates for multiple hostnames and IP addresses. It supports both IPv4 and IPv6 addresses and can be used with Cloudflare's API token authentication.

## Features

- **Dynamic DNS Updates**: Update DNS records for multiple hostnames.
- **IPv4 and IPv6 Support**: Automatically detects whether the provided IP is IPv4 (A) or IPv6 (AAAA) and updates the corresponding record.
- **Basic Authentication**: Uses Basic Auth for securing access, with a configurable application token.
- **Error Handling**: Provides clear error messages when something goes wrong, including issues with fetching zone IDs or updating DNS records.

## Setup

### Prerequisites

- A Cloudflare account with API access.
- A valid API token with DNS editing permissions.
- *(Optional)* Has admin rights to set the `APPLICATION_TOKEN` as a secret key in the Workers & Pages `Settings`.

### Environment Variables

- **`APPLICATION_TOKEN`**: *(Optional)* If set, it prevents unauthorized users from using the system to update their DNS records. Requests must include this token for authentication. The token should be sent in the `username` field during requests to the server.
- By default, the `APPLICATION_TOKEN` feature is disabled. To enable it, go to the Workers & Pages `Settings` and add the `APPLICATION_TOKEN` as a secret key.

## Deployment

### Usage

1. **Basic Authentication**:

   Use Basic Authentication where:
   - `username` is the `APPLICATION_TOKEN` (if the token is enabled; otherwise, you can use any value like `hello`).
   - `password` is the Cloudflare API token.

2. **Request Format**:
   - The request URL should be of the format: `https://username:password@yourdomain.workers.dev/update?ip=<IP>&hostname=<hostname1,hostname2,...>`
   - Replace `<IP>` with the IP address you want to associate with the hostnames.
   - Replace `<hostname1,hostname2,...>` with a comma-separated list of hostnames.

3. **Setup for Unifi**:
   - **Service**: `dyndns` or `custom`
   - **Hostname**: `www.example.com`
   - **Username**: `APPLICATION_TOKEN` or any value (e.g., `hello`)
   - **Password**: Cloudflare DNS API token
   - **Server**: `yourdomain.workers.dev/update?hostname=%h&ip=%i`

### Example Request

- **For example**:
   - `APPLICATION_TOKEN` is `FeMxJH7yu39UU696GyDx3yS6DT7Mv6nwOqVEyIBs`
   - `API_TOKEN` is `46J4Xh0aui7OTl9ReoeeEF6HE23TBDUVMH3HIUX7`

```bash
curl 'https://FeMxJH7yu39UU696GyDx3yS6DT7Mv6nwOqVEyIBs:46J4Xh0aui7OTl9ReoeeEF6HE23TBDUVMH3HIUX7@yourdomain.workers.dev/update?ip=192.168.1.1&hostname=example.com,www.example.com'
