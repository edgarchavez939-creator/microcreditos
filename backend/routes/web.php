<?php
use Illuminate\Support\Facades\Route;
Route::get('/', fn () => response()->json(['app' => 'Microcreditos API', 'docs' => '/api/health']));
