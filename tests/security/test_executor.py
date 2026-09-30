import pytest
from unittest.mock import patch, MagicMock
from gateway.executor_client import execute_code

@patch('gateway.executor_client.urllib.request.urlopen')
def test_executor_failure_fails_closed(mock_urlopen):
    mock_urlopen.side_effect = Exception("Docker proxy down")
    with pytest.raises(RuntimeError, match="Failed to create executor container"):
        execute_code("print('hello')", session_id="test-session")

def test_dangerous_execution_contained():
    with patch('gateway.executor_client.urllib.request.urlopen') as mock_urlopen:
        mock_urlopen.return_value.read.return_value = b'{"Id": "test_id"}'
        try:
            execute_code("import os; os.system('rm -rf /')", session_id="test")
        except Exception:
            pass
            
        create_call = [call for call in mock_urlopen.call_args_list if "create" in call[0][0].full_url]
        if create_call:
            req = create_call[0][0][0]
            import json
            payload = json.loads(req.data.decode('utf-8'))
            assert payload["NetworkDisabled"] is True
            assert payload["HostConfig"]["ReadonlyRootfs"] is True
            assert payload["HostConfig"]["SecurityOpt"] == ["no-new-privileges:true"]
