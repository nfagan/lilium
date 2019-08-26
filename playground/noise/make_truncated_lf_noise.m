audio_filepath = '/Users/Nick/repositories/web/lilium/dist/res/sounds/lf_noise_short.m4a';
[audio_dir, audio_filename] = fileparts( audio_filepath );

[X, fs] = audioread( audio_filepath );

subset = X(0.75e5:end, :);
subset = [subset; flipud(subset)];

audiowrite( fullfile(audio_dir, sprintf('%s-trunc-flipped.m4a', audio_filename)), X, fs );