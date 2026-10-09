import json
import os
import urllib.request
import urllib.error

try:
    from persistence_utils import Persistence, PersistenceError
except ImportError:
    class Persistence:
        def __init__(self, event=None):
            self.event = event
        def get_secret(self, key):
            return os.environ.get(key)
    class PersistenceError(Exception):
        pass

def lambda_handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    try:
        persistence = Persistence(event)
        api_key = None
        try:
            api_key = persistence.get_secret("ANTHROPIC_API_KEY") or persistence.get_secret("ANTHROPIC_API_KEY")
        except Exception:
            pass
        if not api_key:
            api_key = os.environ.get("CLAUDE_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")

        if not api_key:
            return error_response(500, 'CLAUDE_API_KEY not set in persistence', headers)

        body = event.get('body', {})
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except Exception:
                body = {}
        if not isinstance(body, dict):
            body = {}

        system_prompt = body.get('systemPrompt')
        user_prompt = body.get('userPrompt')
        cache_enabled = body.get('cacheEnabled', False)

        if not system_prompt or not user_prompt:
            return error_response(400, 'Missing systemPrompt or userPrompt', headers)

        format_instruction = (
            "\n\nSTRICT OUTPUT FORMAT RULES:\n"
            "1. Provide all scheme analysis and rationale first.\n"
            "2. Conclude your response with the evaluation JSON enclosed in a ```json code block matching this exact structure:\n"
            "```json\n"
            '{"play-type": "<pass|run|RPO>", "offense-advantage": <number between -10 and 10>, "risk-leverage": <number between 0 and 10>}\n'
            "```\n"
            "3. Do not write any explanation, markdown, or text after the closing ``` of the JSON block."
        )
        if "STRICT OUTPUT FORMAT RULES" not in system_prompt:
            system_prompt = system_prompt + format_instruction

        return call_anthropic(system_prompt, user_prompt, api_key, cache_enabled, headers)

    except Exception as e:
        return error_response(500, f'Internal Server Error: {str(e)}', headers)

def call_anthropic(system_prompt, user_prompt, api_key, cache_enabled, headers):
    url = "https://api.anthropic.com/v1/messages"
    
    if cache_enabled:
        system_val = [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]
    else:
        system_val = system_prompt

    payload = {
        "model": "claude-haiku-5-5",
        "max_tokens": 4000,
        "system": system_val,
        "messages": [{"role": "user", "content": user_prompt}]
    }
        
    req_headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }
    
    return make_request(url, payload, req_headers, headers, lambda d: {
        'content': "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text"),
        'usage': d.get('usage', {})
    })

def make_request(url, payload, req_headers, cors_headers, transform_fn):
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=req_headers, method='POST')
        
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_data = json.loads(res_body)
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps(transform_fn(res_data))
            }
    except urllib.error.HTTPError as e:
        error_content = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_content)
            error_msg = error_json.get('error', {}).get('message', error_content)
        except Exception:
            error_msg = error_content
            
        return {
            'statusCode': e.code,
            'headers': cors_headers,
            'body': json.dumps({'error': f'Upstream LLM Provider Error: {error_msg}'})
        }
    except Exception as e:
        return error_response(500, f'Request failure: {str(e)}', cors_headers)


def error_response(status_code, message, headers):
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps({'error': message})
    }