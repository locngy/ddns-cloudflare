import secrets
import string

def generate_secure_base62_id(length=40):
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

unique_id = generate_secure_base62_id()
print(unique_id)
