function filter_noise()

src_p = '/Users/Nick/repositories/web/lilium/dist/res/sounds';
src_file = 'wind-a.aac';

dest_p = src_p;
dest_file = 'wind-a.m4a';

[y, fs] = audioread( fullfile(src_p, src_file) );

cutoff = 350 / (fs/2);
order = 1;

[b, a] = butter( order, cutoff, 'low' );
y = filter( b, a, y );

audiowrite( fullfile(dest_p, dest_file), y, fs );

end