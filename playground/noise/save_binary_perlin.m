file_p = '/Users/Nick/repositories/web/lilium/playground/noise/';

src_file = '64px_120frames.mat';
dest_file = '64px_120frames.bin';

src_image = load( fullfile(file_p, src_file) );
src_image = src_image.(char(fieldnames(src_image)));

dest_image = uint8( src_image*255 );
dest_frame = dest_image(:, :, 1);

fid = fopen( fullfile(file_p, dest_file), 'w', 'l' );
fwrite( fid, dest_image, 'uint8' );
fclose( fid );

fid = fopen( fullfile(file_p, sprintf('frame_%s', dest_file)), 'w', 'l' );
fwrite( fid, dest_frame, 'uint8' );
fclose( fid );

%%

fid = fopen( fullfile(file_p, dest_file), 'r', 'l' );
loaded_image = fread( fid, numel(dest_image), 'uint8=>uint8' );
fclose( fid );

isequaln( dest_image(:), loaded_image(:) );

%%

dest_p = '/Users/Nick/repositories/web/lilium/dist/res/buffers';
dest_file = 'test.bin';

dest_image = single( [1, 12, 13, 12, 11, 0, 0, 11] );

fid = fopen( fullfile(dest_p, dest_file), 'w', 'l' );
fwrite( fid, dest_image, 'float32' );
fclose( fid );