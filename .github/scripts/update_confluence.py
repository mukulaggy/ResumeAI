import os
import requests

# 1. Grab environment variables passed by GitHub Actions
URL = os.environ["CONFLUENCE_URL"].rstrip("/")
PAGE_ID = os.environ["CONFLUENCE_PAGE_ID"]
USER = os.environ["CONFLUENCE_USERNAME"]
TOKEN = os.environ["CONFLUENCE_API_TOKEN"]

PR_TITLE = os.environ.get("PR_TITLE", "Unknown PR")
PR_URL = os.environ.get("PR_URL", "#")
PR_AUTHOR = os.environ.get("PR_AUTHOR", "Unknown")
PR_BODY = os.environ.get("PR_BODY", "No description provided.")

auth = (USER, TOKEN)
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}

api_endpoint = f"{URL}/wiki/rest/api/content/{PAGE_ID}"

try:
    # 2. GET the current page content and version number
    get_url = f"{api_endpoint}?expand=body.storage,version,space"
    response = requests.get(get_url, auth=auth, headers=headers)
    response.raise_for_status()

    page_data = response.json()

    current_version = page_data["version"]["number"]
    current_content = page_data["body"]["storage"]["value"]
    title = page_data["title"]
    space_key = page_data["space"]["key"]

    # 3. Format the new PR data into HTML
    new_entry = f"""
    <hr/>
    <h3>Merged PR: <a href="{PR_URL}">{PR_TITLE}</a></h3>
    <p><strong>Author:</strong> {PR_AUTHOR}</p>
    <p>{PR_BODY}</p>
    """

    # Append new content
    updated_content = current_content + new_entry

    # 4. PUT updated content back to Confluence
    update_payload = {
        "id": PAGE_ID,
        "type": "page",
        "title": title,
        "space": {"key": space_key},
        "body": {
            "storage": {
                "value": updated_content,
                "representation": "storage"
            }
        },
        "version": {
            "number": current_version + 1
        }
    }

    put_response = requests.put(
        api_endpoint,
        json=update_payload,
        auth=auth,
        headers=headers
    )
    put_response.raise_for_status()

    print(f"✅ Successfully updated Confluence page {PAGE_ID} to version {current_version + 1}")

except requests.exceptions.RequestException as e:
    print(f"❌ Failed to update Confluence: {e}")
    exit(1)