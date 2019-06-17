function shrink_lf_noise()

src_p = '/Users/Nick/repositories/web/lilium/dist/res/sounds';
src_file = 'lf_noise.wav';

dest_p = src_p;
dest_file = 'lf_noise_short.m4a';

[y, fs] = audioread( fullfile(src_p, src_file) );

use_secs = 3;
num_samples = size( y, 1 );

mid = floor( num_samples/2 );
N = fs * use_secs;
use_max = min( mid + N, num_samples );

z = y(mid:use_max, :);

audiowrite( fullfile(dest_p, dest_file), z, fs );

end