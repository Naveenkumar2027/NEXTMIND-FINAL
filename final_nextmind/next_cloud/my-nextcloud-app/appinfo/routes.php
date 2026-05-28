<?php
return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#embed', 'url' => '/embed', 'verb' => 'GET'],
		['name' => 'page#weather', 'url' => '/weather', 'verb' => 'GET'],
		['name' => 'chat#list', 'url' => '/chat/{room}', 'verb' => 'GET'],
		['name' => 'chat#send', 'url' => '/chat/{room}/send', 'verb' => 'POST'],
		['name' => 'chat#react', 'url' => '/chat/{room}/react', 'verb' => 'POST'],
		['name' => 'chat#presenceSet', 'url' => '/chat/{room}/presence', 'verb' => 'POST'],
		['name' => 'chat#presenceList', 'url' => '/chat/{room}/presence', 'verb' => 'GET'],
            // Keep POST for the AI chat (frontend uses POST).
            // If you also want GET for manual testing, it must have a unique route name.
            ['name' => 'chat#gemini', 'url' => '/ai/gemini', 'verb' => 'POST'],
            ['name' => 'chat#geminiGet', 'url' => '/ai/gemini', 'verb' => 'GET'],
		['name' => 'chat#ping', 'url' => '/ai/ping', 'verb' => 'GET'],
	]
];
